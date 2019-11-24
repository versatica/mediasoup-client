import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
import { UnsupportedError } from '../errors';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as edgeUtils from './ortc/edgeUtils';
import { IceParameters, IceCandidate, DtlsParameters, DtlsRole } from '../Transport';
import { RtpParameters, RtpEncodingParameters } from '../RtpParameters';
import { SctpParameters } from '../SctpParameters';

const logger = new Logger('Edge11');

export default class Edge11 extends EnhancedEventEmitter
{
	static get label(): string
	{
		return 'Edge11';
	}

	static async getNativeRtpCapabilities(): Promise<any>
	{
		logger.debug('getNativeRtpCapabilities()');

		return edgeUtils.getCapabilities();
	}

	static async getNativeSctpCapabilities(): Promise<any>
	{
		logger.debug('getNativeSctpCapabilities()');

		return {
			numStreams : 0
		};
	}

	// Generic sending RTP parameters for audio and video.
	private readonly _sendingRtpParametersByKind: any;

	// Transport remote ICE parameters.
	private _remoteIceParameters: IceParameters;

	// Transport remote ICE candidates.
	private readonly _remoteIceCandidates: IceCandidate[];

	// Transport remote DTLS parameters.
	private readonly _remoteDtlsParameters: DtlsParameters;

	// Got transport local and remote parameters.
	private _transportReady = false;

	// ICE gatherer.
	private _iceGatherer: any = null;

	// ICE transport.
	private _iceTransport: any = null;

	// DTLS transport.
	private _dtlsTransport: any = null;

	// Map of RTCRtpSenders indexed by id.
	private readonly _rtpSenders: Map<string, RTCRtpSender> = new Map();

	// Map of RTCRtpReceivers indexed by id.
	private readonly _rtpReceivers: Map<string, RTCRtpReceiver> = new Map();

	// Latest localId for sending tracks.
	private _lastSendId = 0;

	// Local RTCP CNAME.
	private readonly _cname: string;

	constructor(
		{
			direction,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
			extendedRtpCapabilities
		}:
		{
			direction: 'send' | 'recv';
			iceParameters: IceParameters;
			iceCandidates: IceCandidate[];
			dtlsParameters: DtlsParameters;
			sctpParameters: SctpParameters;
			iceServers: any[];
			iceTransportPolicy: RTCIceTransportPolicy;
			proprietaryConstraints: any;
			extendedRtpCapabilities: any;
		}
	)
	{
		super(logger);

		logger.debug('constructor() [direction:%s]', direction);

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

	async getTransportStats(): Promise<any>
	{
		return this._iceTransport.getStats();
	}

	async send(
		{ track, encodings }:
		{ track: MediaStreamTrack; encodings?: RtpEncodingParameters[] }
	): Promise<any>
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		logger.debug('send() | calling new RTCRtpSender()');

		const rtpSender = new (RTCRtpSender as any)(track, this._dtlsTransport);
		const rtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind]);
		const useRtx = rtpParameters.codecs
			.some((codec: any) => /.+\/rtx$/i.test(codec.mimeType));

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
			cname       : this._cname,
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

		this._lastSendId++;

		// Store it.
		this._rtpSenders.set(`${this._lastSendId}`, rtpSender);

		return { localId: `${this._lastSendId}`, rtpParameters };
	}

	async stopSending({ localId }: { localId: string }): Promise<void>
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
		{ localId, track }:
		{ localId: string; track: MediaStreamTrack }
	): Promise<void>
	{
		logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);

		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		const oldTrack = rtpSender.track;

		(rtpSender as any).setTrack(track);

		// Replace key.
		this._rtpSenders.delete((oldTrack as any).id);
		this._rtpSenders.set(track.id, rtpSender);
	}

	async setMaxSpatialLayer(
		{ localId, spatialLayer }:
		{ localId: string; spatialLayer: number }
	): Promise<void>
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

	async setRtpEncodingParameters(
		{ localId, params }:
		{ localId: string; params: any }
	): Promise<void>
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

	async getSenderStats({ localId }: { localId: string }): Promise<any>
	{
		const rtpSender = this._rtpSenders.get(localId);

		if (!rtpSender)
			throw new Error('RTCRtpSender not found');

		return rtpSender.getStats();
	}

	async sendDataChannel(): Promise<never>
	{
		throw new UnsupportedError('not implemented');
	}

	async receive(
		{ id, kind, rtpParameters }:
		{ id: string; kind: 'audio' | 'video'; rtpParameters: RtpParameters }
	): Promise<any>
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		logger.debug('receive() | calling new RTCRtpReceiver()');

		const rtpReceiver = new (RTCRtpReceiver as any)(this._dtlsTransport, kind);

		rtpReceiver.addEventListener('error', (event: any) =>
		{
			logger.error('iceGatherer "error" event [event:%o]', event);
		});

		// NOTE: Convert our standard RTCRtpParameters into those that Edge
		// expects.
		const edgeRtpParameters =
			edgeUtils.mangleRtpParameters(rtpParameters);

		logger.debug(
			'receive() | calling rtpReceiver.receive() [params:%o]',
			edgeRtpParameters);

		await rtpReceiver.receive(edgeRtpParameters);

		const localId = id;

		// Store it.
		this._rtpReceivers.set(localId, rtpReceiver);

		return { localId, track: rtpReceiver.track };
	}

	async stopReceiving({ localId }: { localId: string }): Promise<void>
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

	async getReceiverStats({ localId }: { localId: string }): Promise<any>
	{
		const rtpReceiver = this._rtpReceivers.get(localId);

		if (!rtpReceiver)
			throw new Error('RTCRtpReceiver not found');

		return rtpReceiver.getStats();
	}

	async receiveDataChannel(): Promise<never>
	{
		throw new UnsupportedError('not implemented');
	}

	async restartIce(
		{ iceParameters }:
		{ iceParameters: IceParameters }
	): Promise<void>
	{
		logger.debug('restartIce()');

		this._remoteIceParameters = iceParameters;

		if (!this._transportReady)
			return;

		logger.debug('restartIce() | calling iceTransport.start()');

		this._iceTransport.start(
			this._iceGatherer, iceParameters, 'controlling');

		for (const candidate of this._remoteIceCandidates)
		{
			this._iceTransport.addRemoteCandidate(candidate);
		}

		this._iceTransport.addRemoteCandidate({});
	}

	async updateIceServers(
		{ iceServers }: // eslint-disable-line @typescript-eslint/no-unused-vars
		{ iceServers: any[] }
	): Promise<never>
	{
		logger.debug('updateIceServers()');

		// NOTE: Edge 11 does not implement iceGatherer.gater().
		throw new UnsupportedError('not supported');
	}

	_setIceGatherer(
		{ iceServers, iceTransportPolicy }:
		{ iceServers: any[]; iceTransportPolicy: RTCIceTransportPolicy }
	): void
	{
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
				'_setIceGatherer() | iceGatherer.gather() failed: %s', error.toString());
		}

		this._iceGatherer = iceGatherer;
	}

	_setIceTransport(): void
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

	_setDtlsTransport(): void
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

	async _setupTransport(
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
		for (const candidate of this._remoteIceCandidates)
		{
			this._iceTransport.addRemoteCandidate(candidate);
		}

		// Also signal a 'complete' candidate as per spec.
		// NOTE: It should be {complete: true} but Edge prefers {}.
		// NOTE: If we don't signal end of candidates, the Edge RTCIceTransport
		// won't enter the 'completed' state.
		this._iceTransport.addRemoteCandidate({});

		// NOTE: Edge does not like SHA less than 256.
		this._remoteDtlsParameters.fingerprints = this._remoteDtlsParameters.fingerprints
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
