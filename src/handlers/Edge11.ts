import { Logger } from '../Logger';
import { UnsupportedError } from '../errors';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as edgeUtils from './ortc/edgeUtils';
import {
	HandlerFactory,
	HandlerInterface,
	HandlerRunOptions,
	HandlerSendOptions,
	HandlerSendResult,
	HandlerReceiveOptions,
	HandlerReceiveResult,
	HandlerSendDataChannelOptions,
	HandlerSendDataChannelResult,
	HandlerReceiveDataChannelOptions,
	HandlerReceiveDataChannelResult
} from './HandlerInterface';
import {
	IceParameters,
	IceCandidate,
	DtlsParameters,
	DtlsRole
} from '../Transport';
import { RtpCapabilities, RtpParameters } from '../RtpParameters';
import { SctpCapabilities } from '../SctpParameters';

const logger = new Logger('Edge11');

export class Edge11 extends HandlerInterface
{
	// Generic sending RTP parameters for audio and video.
	private _sendingRtpParametersByKind?: { [key: string]: RtpParameters };
	// Transport remote ICE parameters.
	private _remoteIceParameters?: IceParameters;
	// Transport remote ICE candidates.
	private _remoteIceCandidates?: IceCandidate[];
	// Transport remote DTLS parameters.
	private _remoteDtlsParameters?: DtlsParameters;
	// ICE gatherer.
	private _iceGatherer?: any;
	// ICE transport.
	private _iceTransport?: any;
	// DTLS transport.
	private _dtlsTransport?: any;
	// Map of RTCRtpSenders indexed by id.
	private readonly _rtpSenders: Map<string, RTCRtpSender> = new Map();
	// Map of RTCRtpReceivers indexed by id.
	private readonly _rtpReceivers: Map<string, RTCRtpReceiver> = new Map();
	// Next localId for sending tracks.
	private _nextSendLocalId = 0;
	// Local RTCP CNAME.
	private _cname?: string;
	// Got transport local and remote parameters.
	private _transportReady = false;

	/**
	 * Creates a factory function.
	 */
	static createFactory(): HandlerFactory
	{
		return (): Edge11 => new Edge11();
	}

	constructor()
	{
		super();
	}

	get name(): string
	{
		return 'Edge11';
	}

	close(): void
	{
		logger.debug('close()');

		// Close the ICE gatherer.
		// NOTE: Not yet implemented by Edge.
		try { this._iceGatherer.close(); }
		catch (error) {}

		// Close the ICE transport.
		try { this._iceTransport.stop(); }
		catch (error) {}

		// Close the DTLS transport.
		try { this._dtlsTransport.stop(); }
		catch (error) {}

		// Close RTCRtpSenders.
		for (const rtpSender of this._rtpSenders.values())
		{
			try { (rtpSender as any).stop(); }
			catch (error) {}
		}

		// Close RTCRtpReceivers.
		for (const rtpReceiver of this._rtpReceivers.values())
		{
			try { (rtpReceiver as any).stop(); }
			catch (error) {}
		}
	}

	async getNativeRtpCapabilities(): Promise<RtpCapabilities>
	{
		logger.debug('getNativeRtpCapabilities()');

		return edgeUtils.getCapabilities();
	}

	async getNativeSctpCapabilities(): Promise<SctpCapabilities>
	{
		logger.debug('getNativeSctpCapabilities()');

		return {
			numStreams : { OS: 0, MIS: 0 }
		};
	}

	run(
		{
			direction, // eslint-disable-line @typescript-eslint/no-unused-vars
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters, // eslint-disable-line @typescript-eslint/no-unused-vars
			iceServers,
			iceTransportPolicy,
			additionalSettings, // eslint-disable-line @typescript-eslint/no-unused-vars
			proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
			extendedRtpCapabilities
		}: HandlerRunOptions
	): void
	{
		logger.debug('run()');

		this._sendingRtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		this._remoteIceParameters = iceParameters;
		this._remoteIceCandidates = iceCandidates;
		this._remoteDtlsParameters = dtlsParameters;
		this._cname = `CNAME-${utils.generateRandomNumber()}`;

		this._setIceGatherer({ iceServers, iceTransportPolicy });
		this._setIceTransport();
		this._setDtlsTransport();
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async updateIceServers(iceServers: RTCIceServer[]): Promise<void>
	{
		// NOTE: Edge 11 does not implement iceGatherer.gater().
		throw new UnsupportedError('not supported');
	}

	async restartIce(iceParameters: IceParameters): Promise<void>
	{
		logger.debug('restartIce()');

		this._remoteIceParameters = iceParameters;

		if (!this._transportReady)
			return;

		logger.debug('restartIce() | calling iceTransport.start()');

		this._iceTransport.start(
			this._iceGatherer, iceParameters, 'controlling');

		for (const candidate of this._remoteIceCandidates!)
		{
			this._iceTransport.addRemoteCandidate(candidate);
		}

		this._iceTransport.addRemoteCandidate({});
	}

	async getTransportStats(): Promise<RTCStatsReport>
	{
		return this._iceTransport.getStats();
	}

	async send(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		{ track, encodings, codecOptions, codec }: HandlerSendOptions
	): Promise<HandlerSendResult>
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		logger.debug('send() | calling new RTCRtpSender()');

		const rtpSender = new (RTCRtpSender as any)(track, this._dtlsTransport);
		const rtpParameters =
			utils.clone(this._sendingRtpParametersByKind![track.kind], {});

		rtpParameters.codecs = ortc.reduceCodecs(rtpParameters.codecs, codec);

		const useRtx = rtpParameters.codecs
			.some((_codec: any) => /.+\/rtx$/i.test(_codec.mimeType));

		if (!encodings)
			encodings = [ {} ];

		for (const encoding of encodings)
		{
			encoding.ssrc = utils.generateRandomNumber();

			if (useRtx)
				encoding.rtx = { ssrc: utils.generateRandomNumber() };
		}

		rtpParameters.encodings = encodings;

		// Fill RTCRtpParameters.rtcp.
		rtpParameters.rtcp =
		{
			cname       : this._cname!,
			reducedSize : true,
			mux         : true
		};

		// NOTE: Convert our standard RTCRtpParameters into those that Edge
		// expects.
		const edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);

		logger.debug(
			'send() | calling rtpSender.send() [params:%o]',
			edgeRtpParameters);

		await rtpSender.send(edgeRtpParameters);

		const localId = String(this._nextSendLocalId);

		this._nextSendLocalId++;

		// Store it.
		this._rtpSenders.set(localId, rtpSender);

		return { localId, rtpParameters, rtpSender };
	}

	async stopSending(localId: string): Promise<void>
	{
		logger.debug('stopSending() [localId:%s]', localId);

		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		this._rtpSenders.delete(localId);

		try
		{
			logger.debug('stopSending() | calling rtpSender.stop()');

			(rtpSender as any).stop();
		}
		catch (error)
		{
			logger.warn('stopSending() | rtpSender.stop() failed:%o', error);

			throw error;
		}
	}

	async replaceTrack(
		localId: string, track: MediaStreamTrack | null
	): Promise<void>
	{
		if (track)
		{
			logger.debug(
				'replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
		}
		else
		{
			logger.debug('replaceTrack() [localId:%s, no track]', localId);
		}

		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		(rtpSender as any).setTrack(track);
	}

	async setMaxSpatialLayer(localId: string, spatialLayer: number): Promise<void>
	{
		logger.debug(
			'setMaxSpatialLayer() [localId:%s, spatialLayer:%s]',
			localId, spatialLayer);

		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		const parameters = rtpSender.getParameters();

		parameters.encodings
			.forEach((encoding, idx) =>
			{
				if (idx <= spatialLayer)
					encoding.active = true;
				else
					encoding.active = false;
			});

		await rtpSender.setParameters(parameters);
	}

	async setRtpEncodingParameters(localId: string, params: any): Promise<void>
	{
		logger.debug(
			'setRtpEncodingParameters() [localId:%s, params:%o]',
			localId, params);

		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		const parameters = rtpSender.getParameters();

		parameters.encodings.forEach((encoding: any, idx: number) =>
		{
			parameters.encodings[idx] = { ...encoding, ...params };
		});

		await rtpSender.setParameters(parameters);
	}

	async getSenderStats(localId: string): Promise<RTCStatsReport>
	{
		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		return rtpSender.getStats();
	}

	async sendDataChannel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		options: HandlerSendDataChannelOptions
	): Promise<HandlerSendDataChannelResult>
	{
		throw new UnsupportedError('not implemented');
	}

	async receive(
		optionsList: HandlerReceiveOptions[]
	) : Promise<HandlerReceiveResult[]>
	{
		const results: HandlerReceiveResult[] = [];

		for (const options of optionsList)
		{
			const { trackId, kind } = options;

			logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
		}

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		for (const options of optionsList)
		{
			const { trackId, kind, rtpParameters } = options;

			logger.debug('receive() | calling new RTCRtpReceiver()');

			const rtpReceiver = new (RTCRtpReceiver as any)(this._dtlsTransport, kind);

			rtpReceiver.addEventListener('error', (event: any) =>
			{
				logger.error('rtpReceiver "error" event [event:%o]', event);
			});

			// NOTE: Convert our standard RTCRtpParameters into those that Edge
			// expects.
			const edgeRtpParameters =
				edgeUtils.mangleRtpParameters(rtpParameters);

			logger.debug(
				'receive() | calling rtpReceiver.receive() [params:%o]',
				edgeRtpParameters);

			await rtpReceiver.receive(edgeRtpParameters);

			const localId = trackId;

			// Store it.
			this._rtpReceivers.set(localId, rtpReceiver);

			results.push({
				localId,
				track : rtpReceiver.track,
				rtpReceiver
			});
		}

		return results;
	}

	async stopReceiving(localId: string): Promise<void>
	{
		logger.debug('stopReceiving() [localId:%s]', localId);

		const rtpReceiver = this._rtpReceivers.get(localId);

		if (!rtpReceiver)
			throw new Error('RTCRtpReceiver not found');

		this._rtpReceivers.delete(localId);

		try
		{
			logger.debug('stopReceiving() | calling rtpReceiver.stop()');

			(rtpReceiver as any).stop();
		}
		catch (error)
		{
			logger.warn('stopReceiving() | rtpReceiver.stop() failed:%o', error);
		}
	}

	async pauseReceiving(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		localIds: string[]): Promise<void>
	{
		// Unimplemented.
	}

	async resumeReceiving(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		localIds: string[]): Promise<void>
	{
		// Unimplemented.
	}

	async getReceiverStats(localId: string): Promise<RTCStatsReport>
	{
		const rtpReceiver = this._rtpReceivers.get(localId);

		if (!rtpReceiver)
			throw new Error('RTCRtpReceiver not found');

		return rtpReceiver.getStats();
	}

	async receiveDataChannel(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		options: HandlerReceiveDataChannelOptions
	): Promise<HandlerReceiveDataChannelResult>
	{
		throw new UnsupportedError('not implemented');
	}

	private _setIceGatherer(
		{ iceServers, iceTransportPolicy }:
		{ iceServers?: any[]; iceTransportPolicy?: RTCIceTransportPolicy }
	): void
	{
		// @ts-ignore
		const iceGatherer = new (RTCIceGatherer as any)(
			{
				iceServers   : iceServers || [],
				gatherPolicy : iceTransportPolicy || 'all'
			});

		iceGatherer.addEventListener('error', (event: any) =>
		{
			logger.error('iceGatherer "error" event [event:%o]', event);
		});

		// NOTE: Not yet implemented by Edge, which starts gathering automatically.
		try
		{
			iceGatherer.gather();
		}
		catch (error)
		{
			logger.debug(
				'_setIceGatherer() | iceGatherer.gather() failed: %s',
				(error as Error).toString());
		}

		this._iceGatherer = iceGatherer;
	}

	private _setIceTransport(): void
	{
		const iceTransport = new (RTCIceTransport as any)(this._iceGatherer);

		// NOTE: Not yet implemented by Edge.
		iceTransport.addEventListener('statechange', () =>
		{
			switch (iceTransport.state)
			{
				case 'checking':
					this.emit('@connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('@connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('@connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('@connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('@connectionstatechange', 'closed');
					break;
			}
		});

		// NOTE: Not standard, but implemented by Edge.
		iceTransport.addEventListener('icestatechange', () =>
		{
			switch (iceTransport.state)
			{
				case 'checking':
					this.emit('@connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('@connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('@connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('@connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('@connectionstatechange', 'closed');
					break;
			}
		});

		iceTransport.addEventListener('candidatepairchange', (event: any) =>
		{
			logger.debug(
				'iceTransport "candidatepairchange" event [pair:%o]', event.pair);
		});

		this._iceTransport = iceTransport;
	}

	private _setDtlsTransport(): void
	{
		const dtlsTransport = new (RTCDtlsTransport as any)(this._iceTransport);

		// NOTE: Not yet implemented by Edge.
		dtlsTransport.addEventListener('statechange', () =>
		{
			logger.debug(
				'dtlsTransport "statechange" event [state:%s]', dtlsTransport.state);
		});

		// NOTE: Not standard, but implemented by Edge.
		dtlsTransport.addEventListener('dtlsstatechange', () =>
		{
			logger.debug(
				'dtlsTransport "dtlsstatechange" event [state:%s]', dtlsTransport.state);

			if (dtlsTransport.state === 'closed')
				this.emit('@connectionstatechange', 'closed');
		});

		dtlsTransport.addEventListener('error', (event: any) =>
		{
			logger.error('dtlsTransport "error" event [event:%o]', event);
		});

		this._dtlsTransport = dtlsTransport;
	}

	private async _setupTransport(
		{ localDtlsRole }:
		{ localDtlsRole: DtlsRole }
	): Promise<void>
	{
		logger.debug('_setupTransport()');

		// Get our local DTLS parameters.
		const dtlsParameters = this._dtlsTransport.getLocalParameters();

		dtlsParameters.role = localDtlsRole;

		// Need to tell the remote transport about our parameters.
		await this.safeEmitAsPromise('@connect', { dtlsParameters });

		// Start the RTCIceTransport.
		this._iceTransport.start(
			this._iceGatherer, this._remoteIceParameters, 'controlling');

		// Add remote ICE candidates.
		for (const candidate of this._remoteIceCandidates!)
		{
			this._iceTransport.addRemoteCandidate(candidate);
		}

		// Also signal a 'complete' candidate as per spec.
		// NOTE: It should be {complete: true} but Edge prefers {}.
		// NOTE: If we don't signal end of candidates, the Edge RTCIceTransport
		// won't enter the 'completed' state.
		this._iceTransport.addRemoteCandidate({});

		// NOTE: Edge does not like SHA less than 256.
		this._remoteDtlsParameters!.fingerprints = this._remoteDtlsParameters!.fingerprints
			.filter((fingerprint: any) =>
			{
				return (
					fingerprint.algorithm === 'sha-256' ||
					fingerprint.algorithm === 'sha-384' ||
					fingerprint.algorithm === 'sha-512'
				);
			});

		// Start the RTCDtlsTransport.
		this._dtlsTransport.start(this._remoteDtlsParameters);

		this._transportReady = true;
	}
}
