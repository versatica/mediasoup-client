import * as sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
import { UnsupportedError } from '../errors';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as sdpCommonUtils from './sdp/commonUtils';
import * as sdpUnifiedPlanUtils from './sdp/unifiedPlanUtils';
import RemoteSdp from './sdp/RemoteSdp';
import { ProducerCodecOptions } from '../Producer';
import {
	IceParameters,
	IceCandidate,
	DtlsParameters,
	DtlsRole
} from './../Transport';
import {
	RtpCapabilities,
	RtpParameters,
	RtpEncodingParameters
} from '../RtpParameters';
import {
	SctpCapabilities,
	SctpParameters,
	SctpStreamParameters
} from '../SctpParameters';

const logger = new Logger('Firefox60');

const SCTP_NUM_STREAMS = { OS: 16, MIS: 2048 };

class Handler extends EnhancedEventEmitter
{
	// Got transport local and remote parameters.
	protected _transportReady = false;

	// Remote SDP handler.
	protected _remoteSdp: RemoteSdp;

	// RTCPeerConnection instance.
	protected _pc: any;

	// Map of RTCTransceivers indexed by MID.
	protected readonly _mapMidTransceiver: Map<string, any> = new Map();

	// Whether a DataChannel m=application section has been created.
	protected _hasDataChannelMediaSection = false;

	// DataChannel id value counter. It must be incremented for each new DataChannel.
	protected _nextSctpStreamId = 0;

	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			proprietaryConstraints
		}:
		{
			iceParameters: IceParameters;
			iceCandidates: IceCandidate[];
			dtlsParameters: DtlsParameters;
			sctpParameters?: SctpParameters;
			iceServers?: RTCIceServer[];
			iceTransportPolicy?: RTCIceTransportPolicy;
			additionalSettings?: any;
			proprietaryConstraints?: any; // eslint-disable-line no-unused-vars
		}
	)
	{
		super(logger);

		this._remoteSdp = new RemoteSdp(
			{
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters
			});

		this._pc = new (RTCPeerConnection as any)(
			{
				iceServers         : iceServers || [],
				iceTransportPolicy : iceTransportPolicy || 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require',
				...additionalSettings
			},
			proprietaryConstraints);

		// Handle RTCPeerConnection connection status.
		this._pc.addEventListener('iceconnectionstatechange', () =>
		{
			switch (this._pc.iceConnectionState)
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
	}

	close(): void
	{
		logger.debug('close()');

		// Close RTCPeerConnection.
		try { this._pc.close(); }
		catch (error) {}
	}

	async getTransportStats(): Promise<any>
	{
		return this._pc.getStats();
	}

	async updateIceServers(
		{ iceServers }: // eslint-disable-line @typescript-eslint/no-unused-vars
		{ iceServers: RTCIceServer[] }
	): Promise<never>
	{
		logger.debug('updateIceServers()');

		// NOTE: Firefox does not implement pc.setConfiguration().
		throw new UnsupportedError('not supported');
	}

	async _setupTransport(
		{ localDtlsRole, localSdpObject = null }:
		{ localDtlsRole: DtlsRole; localSdpObject: any | null }
	): Promise<void>
	{
		if (!localSdpObject)
			localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);

		// Get our local DTLS parameters.
		const dtlsParameters =
			sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });

		// Set our DTLS role.
		dtlsParameters.role = localDtlsRole;

		// Update the remote DTLS role in the SDP.
		this._remoteSdp.updateDtlsRole(
			localDtlsRole === 'client' ? 'server' : 'client');

		// Need to tell the remote transport about our parameters.
		await this.safeEmitAsPromise('@connect', { dtlsParameters });

		this._transportReady = true;
	}
}

class SendHandler extends Handler
{
	// Generic sending RTP parameters for audio and video.
	private _sendingRtpParametersByKind: any;

	// Generic sending RTP parameters for audio and video suitable for the SDP
	// remote answer.
	private _sendingRemoteRtpParametersByKind: any;

	// Local stream.
	private readonly _stream = new MediaStream();

	constructor(data: any)
	{
		super(data);

		this._sendingRtpParametersByKind = data.sendingRtpParametersByKind;
		this._sendingRemoteRtpParametersByKind = data.sendingRemoteRtpParametersByKind;
	}

	async send(
		{ track, encodings, codecOptions }:
		{
			track: MediaStreamTrack;
			encodings?: RtpEncodingParameters[];
			codecOptions?: ProducerCodecOptions;
		}
	): Promise<any>
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		let reverseEncodings;

		if (encodings && encodings.length > 1)
		{
			encodings.forEach((encoding, idx) =>
			{
				encoding.rid = `r${idx}`;
			});

			// Clone the encodings and reverse them because Firefox likes them
			// from high to low.
			reverseEncodings = utils.clone(encodings).reverse();
		}

		const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
		const transceiver = this._pc.addTransceiver(
			track, { direction: 'sendonly', streams: [ this._stream ] });

		// NOTE: This is not spec compliants. Encodings should be given in addTransceiver
		// second argument, but Firefox does not support it.
		if (reverseEncodings)
		{
			const parameters = transceiver.sender.getParameters();

			parameters.encodings = reverseEncodings;
			await transceiver.sender.setParameters(parameters);
		}

		const offer = await this._pc.createOffer();
		let localSdpObject = sdpTransform.parse(offer.sdp);
		const sendingRtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind]);

		// In Firefox use DTLS role client even if we are the "offerer" since
		// Firefox does not respect ICE-Lite.
		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client', localSdpObject });

		logger.debug(
			'send() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		// We can now get the transceiver.mid.
		const localId = transceiver.mid;

		// Set MID.
		sendingRtpParameters.mid = localId;

		localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);

		const offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];

		// Set RTCP CNAME.
		sendingRtpParameters.rtcp.cname =
			sdpCommonUtils.getCname({ offerMediaObject });

		// Set RTP encodings by parsing the SDP offer if no encodings are given.
		if (!encodings)
		{
			sendingRtpParameters.encodings =
				sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });
		}
		// Set RTP encodings by parsing the SDP offer and complete them with given
		// one if just a single encoding has been given.
		else if (encodings.length === 1)
		{
			const newEncodings =
				sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });

			Object.assign(newEncodings[0], encodings[0]);

			sendingRtpParameters.encodings = newEncodings;
		}
		// Otherwise if more than 1 encoding are given use them verbatim.
		else
		{
			sendingRtpParameters.encodings = encodings;
		}

		// If VP8 or H264 and there is effective simulcast, add scalabilityMode to
		// each encoding.
		if (
			sendingRtpParameters.encodings.length > 1 &&
			(
				sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
				sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264'
			)
		)
		{
			for (const encoding of sendingRtpParameters.encodings)
			{
				encoding.scalabilityMode = 'S1T3';
			}
		}

		this._remoteSdp.send(
			{
				offerMediaObject,
				reuseMid            : mediaSectionIdx.reuseMid,
				offerRtpParameters  : sendingRtpParameters,
				answerRtpParameters : this._sendingRemoteRtpParametersByKind[track.kind],
				codecOptions
			});

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'send() | calling pc.setRemoteDescription() [answer:%o]', answer);

		await this._pc.setRemoteDescription(answer);

		// Store in the map.
		this._mapMidTransceiver.set(localId, transceiver);

		return { localId, rtpParameters: sendingRtpParameters };
	}

	async stopSending({ localId }: { localId: string }): Promise<void>
	{
		logger.debug('stopSending() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		transceiver.sender.replaceTrack(null);
		this._pc.removeTrack(transceiver.sender);
		this._remoteSdp.closeMediaSection(transceiver.mid);

		const offer = await this._pc.createOffer();

		logger.debug(
			'stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);

		await this._pc.setRemoteDescription(answer);
	}

	async replaceTrack(
		{ localId, track }:
		{ localId: string; track: MediaStreamTrack }
	): Promise<void>
	{
		logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		await transceiver.sender.replaceTrack(track);
	}

	async setMaxSpatialLayer(
		{ localId, spatialLayer }:
		{ localId: string; spatialLayer: number }
	): Promise<void>
	{
		logger.debug(
			'setMaxSpatialLayer() [localId:%s, spatialLayer:%s]',
			localId, spatialLayer);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		const parameters = transceiver.sender.getParameters();

		// NOTE: We require encodings given from low to high, however Firefox
		// requires them in reverse order, so do magic here.
		spatialLayer = parameters.encodings.length - 1 - spatialLayer;

		parameters.encodings.forEach((encoding: any, idx: number) =>
		{
			if (idx >= spatialLayer)
				encoding.active = true;
			else
				encoding.active = false;
		});

		await transceiver.sender.setParameters(parameters);
	}

	async setRtpEncodingParameters(
		{ localId, params }:
		{ localId: string; params: any }
	): Promise<void>
	{
		logger.debug(
			'setRtpEncodingParameters() [localId:%s, params:%o]',
			localId, params);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated RTCRtpTransceiver not found');

		const parameters = transceiver.sender.getParameters();

		parameters.encodings.forEach((encoding: any, idx: number) =>
		{
			parameters.encodings[idx] = { ...encoding, ...params };
		});

		await transceiver.sender.setParameters(parameters);
	}

	async getSenderStats({ localId }: { localId: string }): Promise<any>
	{
		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		return transceiver.sender.getStats();
	}

	async sendDataChannel(
		{
			ordered = true,
			maxPacketLifeTime,
			maxRetransmits,
			priority = 'low',
			label = '',
			protocol = ''
		}: SctpStreamParameters
	): Promise<any>
	{
		logger.debug('sendDataChannel()');

		const options =
		{
			negotiated : true,
			id         : this._nextSctpStreamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			protocol,
			priority
		};

		logger.debug('DataChannel options:%o', options);

		const dataChannel = this._pc.createDataChannel(label, options);

		// Increase next id.
		this._nextSctpStreamId = ++this._nextSctpStreamId % SCTP_NUM_STREAMS.MIS;

		// If this is the first DataChannel we need to create the SDP answer with
		// m=application section.
		if (!this._hasDataChannelMediaSection)
		{
			const offer = await this._pc.createOffer();
			const localSdpObject = sdpTransform.parse(offer.sdp);
			const offerMediaObject = localSdpObject.media
				.find((m: any) => m.type === 'application');

			if (!this._transportReady)
				await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

			logger.debug(
				'sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);

			await this._pc.setLocalDescription(offer);

			this._remoteSdp.sendSctpAssociation({ offerMediaObject });

			const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

			logger.debug(
				'sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);

			await this._pc.setRemoteDescription(answer);

			this._hasDataChannelMediaSection = true;
		}

		const sctpStreamParameters =
		{
			streamId          : options.id,
			ordered           : options.ordered,
			maxPacketLifeTime : options.maxPacketLifeTime,
			maxRetransmits    : options.maxRetransmits
		};

		return { dataChannel, sctpStreamParameters };
	}

	async restartIce(
		{ iceParameters }:
		{ iceParameters: IceParameters }
	): Promise<void>
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateIceParameters(iceParameters);

		if (!this._transportReady)
			return;

		const offer = await this._pc.createOffer({ iceRestart: true });

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);

		await this._pc.setRemoteDescription(answer);
	}
}

class RecvHandler extends Handler
{
	// MID value counter. It must be converted to string and incremented for
	// each new m= section.
	private _nextMid = 0;

	constructor(data: any)
	{
		super(data);
	}

	async receive(
		{ id, kind, rtpParameters }:
		{ id: string; kind: 'audio' | 'video'; rtpParameters: RtpParameters }
	): Promise<any>
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		const localId = String(this._nextMid);

		this._remoteSdp.receive(
			{
				mid                : localId,
				kind,
				offerRtpParameters : rtpParameters,
				streamId           : rtpParameters.rtcp.cname,
				trackId            : id
			});

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'receive() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		let answer = await this._pc.createAnswer();
		const localSdpObject = sdpTransform.parse(answer.sdp);
		const answerMediaObject = localSdpObject.media
			.find((m: any) => String(m.mid) === localId);

		// May need to modify codec parameters in the answer based on codec
		// parameters in the offer.
		sdpCommonUtils.applyCodecParameters(
			{
				offerRtpParameters : rtpParameters,
				answerMediaObject
			});

		answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client', localSdpObject });

		logger.debug(
			'receive() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);

		const transceiver = this._pc.getTransceivers()
			.find((t: any) => t.mid === localId);

		if (!transceiver)
			throw new Error('new transceiver not found');

		// Store in the map.
		this._mapMidTransceiver.set(localId, transceiver);

		// Increase next MID.
		this._nextMid++;

		return { localId, track: transceiver.receiver.track };
	}

	async stopReceiving({ localId }: { localId: string }): Promise<void>
	{
		logger.debug('stopReceiving() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		this._remoteSdp.closeMediaSection(transceiver.mid);

		const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats({ localId }: { localId: string }): Promise<any>
	{
		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		return transceiver.receiver.getStats();
	}

	async receiveDataChannel(
		{ sctpStreamParameters, label, protocol }:
		{ sctpStreamParameters: SctpStreamParameters; label?: string; protocol?: string }
	): Promise<any>
	{
		logger.debug('receiveDataChannel()');

		const {
			streamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits
		} = sctpStreamParameters;

		const options =
		{
			negotiated : true,
			id         : streamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			protocol
		};

		logger.debug('DataChannel options:%o', options);

		const dataChannel = this._pc.createDataChannel(label, options);

		// If this is the first DataChannel we need to create the SDP offer with
		// m=application section.
		if (!this._hasDataChannelMediaSection)
		{
			this._remoteSdp.receiveSctpAssociation();

			const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

			logger.debug(
				'receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);

			await this._pc.setRemoteDescription(offer);

			const answer = await this._pc.createAnswer();

			if (!this._transportReady)
			{
				const localSdpObject = sdpTransform.parse(answer.sdp);

				await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
			}

			logger.debug(
				'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);

			await this._pc.setLocalDescription(answer);

			this._hasDataChannelMediaSection = true;
		}

		return { dataChannel };
	}

	async restartIce(
		{ iceParameters }:
		{ iceParameters: IceParameters }
	): Promise<void>
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateIceParameters(iceParameters);

		if (!this._transportReady)
			return;

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}
}

export default class Firefox60
{
	static get label(): string
	{
		return 'Firefox60';
	}

	static async getNativeRtpCapabilities(): Promise<RtpCapabilities>
	{
		logger.debug('getNativeRtpCapabilities()');

		const pc = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		// NOTE: We need to add a real video track to get the RID extension mapping.
		const canvas = document.createElement('canvas');

		// NOTE: Otherwise Firefox fails in next line.
		canvas.getContext('2d');

		const fakeStream = (canvas as any).captureStream();
		const fakeVideoTrack = fakeStream.getVideoTracks()[0];

		try
		{
			pc.addTransceiver('audio', { direction: 'sendrecv' });

			const videoTransceiver =
				pc.addTransceiver(fakeVideoTrack, { direction: 'sendrecv' });
			const parameters = videoTransceiver.sender.getParameters();
			const encodings =
			[
				{ rid: 'r0', maxBitrate: 100000 },
				{ rid: 'r1', maxBitrate: 500000 }
			];

			parameters.encodings = encodings;
			await videoTransceiver.sender.setParameters(parameters);

			const offer = await pc.createOffer();

			try { canvas.remove(); }
			catch (error) {}

			try { fakeVideoTrack.stop(); }
			catch (error) {}

			try { pc.close(); }
			catch (error) {}

			const sdpObject = sdpTransform.parse(offer.sdp);
			const nativeRtpCapabilities =
				sdpCommonUtils.extractRtpCapabilities({ sdpObject });

			return nativeRtpCapabilities;
		}
		catch (error)
		{
			try { canvas.remove(); }
			catch (error2) {}

			try { fakeVideoTrack.stop(); }
			catch (error2) {}

			try { pc.close(); }
			catch (error2) {}

			throw error;
		}
	}

	static async getNativeSctpCapabilities(): Promise<SctpCapabilities>
	{
		logger.debug('getNativeSctpCapabilities()');

		return {
			numStreams : SCTP_NUM_STREAMS
		};
	}

	constructor(
		{
			direction,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			proprietaryConstraints,
			extendedRtpCapabilities
		}:
		{
			direction: 'send' | 'recv';
			iceParameters: IceParameters;
			iceCandidates: IceCandidate[];
			dtlsParameters: DtlsParameters;
			sctpParameters?: SctpParameters;
			iceServers?: RTCIceServer[];
			iceTransportPolicy?: RTCIceTransportPolicy;
			additionalSettings?: any;
			proprietaryConstraints?: any;
			extendedRtpCapabilities: any;
		}
	)
	{
		logger.debug('constructor() [direction:%s]', direction);

		switch (direction)
		{
			case 'send':
			{
				const sendingRtpParametersByKind =
				{
					audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
				};

				const sendingRemoteRtpParametersByKind =
				{
					audio : ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities)
				};

				return new SendHandler(
					{
						iceParameters,
						iceCandidates,
						dtlsParameters,
						sctpParameters,
						iceServers,
						iceTransportPolicy,
						additionalSettings,
						proprietaryConstraints,
						sendingRtpParametersByKind,
						sendingRemoteRtpParametersByKind
					});
			}

			case 'recv':
			{
				return new RecvHandler(
					{
						iceParameters,
						iceCandidates,
						dtlsParameters,
						sctpParameters,
						iceServers,
						iceTransportPolicy,
						additionalSettings,
						proprietaryConstraints
					});
			}
		}
	}
}
