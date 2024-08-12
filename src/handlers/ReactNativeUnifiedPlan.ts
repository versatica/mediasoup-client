import * as sdpTransform from 'sdp-transform';
import { Logger } from '../Logger';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as sdpCommonUtils from './sdp/commonUtils';
import * as sdpUnifiedPlanUtils from './sdp/unifiedPlanUtils';
import * as ortcUtils from './ortc/utils';
import { InvalidStateError } from '../errors';
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
	HandlerReceiveDataChannelResult,
} from './HandlerInterface';
import { RemoteSdp } from './sdp/RemoteSdp';
import { parse as parseScalabilityMode } from '../scalabilityModes';
import { IceParameters, DtlsRole } from '../Transport';
import {
	RtpCapabilities,
	RtpParameters,
	RtpEncodingParameters,
} from '../RtpParameters';
import { SctpCapabilities, SctpStreamParameters } from '../SctpParameters';

const logger = new Logger('ReactNativeUnifiedPlan');

const NAME = 'ReactNativeUnifiedPlan';
const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };

export class ReactNativeUnifiedPlan extends HandlerInterface {
	// Closed flag.
	private _closed = false;
	// Handler direction.
	private _direction?: 'send' | 'recv';
	// Remote SDP handler.
	private _remoteSdp?: RemoteSdp;
	// Generic sending RTP parameters for audio and video.
	private _sendingRtpParametersByKind?: { [key: string]: RtpParameters };
	// Generic sending RTP parameters for audio and video suitable for the SDP
	// remote answer.
	private _sendingRemoteRtpParametersByKind?: { [key: string]: RtpParameters };
	// Initial server side DTLS role. If not 'auto', it will force the opposite
	// value in client side.
	private _forcedLocalDtlsRole?: DtlsRole;
	// RTCPeerConnection instance.
	private _pc: any;
	// Map of RTCTransceivers indexed by MID.
	private readonly _mapMidTransceiver: Map<string, RTCRtpTransceiver> =
		new Map();
	// Local stream for sending.
	private readonly _sendStream = new MediaStream();
	// Whether a DataChannel m=application section has been created.
	private _hasDataChannelMediaSection = false;
	// Sending DataChannel id value counter. Incremented for each new DataChannel.
	private _nextSendSctpStreamId = 0;
	// Got transport local and remote parameters.
	private _transportReady = false;

	/**
	 * Creates a factory function.
	 */
	static createFactory(): HandlerFactory {
		return (): ReactNativeUnifiedPlan => new ReactNativeUnifiedPlan();
	}

	constructor() {
		super();
	}

	get name(): string {
		return NAME;
	}

	close(): void {
		logger.debug('close()');

		if (this._closed) {
			return;
		}

		this._closed = true;

		// Free/dispose native MediaStream but DO NOT free/dispose native
		// MediaStreamTracks (that is parent's business).
		// @ts-expect-error --- Proprietary API in react-native-webrtc.
		this._sendStream.release(/* releaseTracks */ false);

		// Close RTCPeerConnection.
		if (this._pc) {
			try {
				this._pc.close();
			} catch (error) {}
		}

		this.emit('@close');
	}

	async getNativeRtpCapabilities(): Promise<RtpCapabilities> {
		logger.debug('getNativeRtpCapabilities()');

		const pc = new (RTCPeerConnection as any)({
			iceServers: [],
			iceTransportPolicy: 'all',
			bundlePolicy: 'max-bundle',
			rtcpMuxPolicy: 'require',
			sdpSemantics: 'unified-plan',
		});

		try {
			pc.addTransceiver('audio');
			pc.addTransceiver('video');

			const offer = await pc.createOffer();

			try {
				pc.close();
			} catch (error) {}

			const sdpObject = sdpTransform.parse(offer.sdp);
			const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
				sdpObject,
			});

			// libwebrtc supports NACK for OPUS but doesn't announce it.
			ortcUtils.addNackSuppportForOpus(nativeRtpCapabilities);

			return nativeRtpCapabilities;
		} catch (error) {
			try {
				pc.close();
			} catch (error2) {}

			throw error;
		}
	}

	async getNativeSctpCapabilities(): Promise<SctpCapabilities> {
		logger.debug('getNativeSctpCapabilities()');

		return {
			numStreams: SCTP_NUM_STREAMS,
		};
	}

	run({
		direction,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		iceServers,
		iceTransportPolicy,
		additionalSettings,
		proprietaryConstraints,
		extendedRtpCapabilities,
	}: HandlerRunOptions): void {
		this.assertNotClosed();

		logger.debug('run()');

		this._direction = direction;

		this._remoteSdp = new RemoteSdp({
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
		});

		this._sendingRtpParametersByKind = {
			audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
		};

		this._sendingRemoteRtpParametersByKind = {
			audio: ortc.getSendingRemoteRtpParameters(
				'audio',
				extendedRtpCapabilities
			),
			video: ortc.getSendingRemoteRtpParameters(
				'video',
				extendedRtpCapabilities
			),
		};

		if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
			this._forcedLocalDtlsRole =
				dtlsParameters.role === 'server' ? 'client' : 'server';
		}

		this._pc = new (RTCPeerConnection as any)(
			{
				iceServers: iceServers ?? [],
				iceTransportPolicy: iceTransportPolicy ?? 'all',
				bundlePolicy: 'max-bundle',
				rtcpMuxPolicy: 'require',
				sdpSemantics: 'unified-plan',
				...additionalSettings,
			},
			proprietaryConstraints
		);

		this._pc.addEventListener('icegatheringstatechange', () => {
			this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
		});

		if (this._pc.connectionState) {
			this._pc.addEventListener('connectionstatechange', () => {
				this.emit('@connectionstatechange', this._pc.connectionState);
			});
		} else {
			this._pc.addEventListener('iceconnectionstatechange', () => {
				logger.warn(
					'run() | pc.connectionState not supported, using pc.iceConnectionState'
				);

				switch (this._pc.iceConnectionState) {
					case 'checking': {
						this.emit('@connectionstatechange', 'connecting');

						break;
					}

					case 'connected':
					case 'completed': {
						this.emit('@connectionstatechange', 'connected');

						break;
					}

					case 'failed': {
						this.emit('@connectionstatechange', 'failed');

						break;
					}

					case 'disconnected': {
						this.emit('@connectionstatechange', 'disconnected');

						break;
					}

					case 'closed': {
						this.emit('@connectionstatechange', 'closed');

						break;
					}
				}
			});
		}
	}

	async updateIceServers(iceServers: RTCIceServer[]): Promise<void> {
		this.assertNotClosed();

		logger.debug('updateIceServers()');

		const configuration = this._pc.getConfiguration();

		configuration.iceServers = iceServers;

		this._pc.setConfiguration(configuration);
	}

	async restartIce(iceParameters: IceParameters): Promise<void> {
		this.assertNotClosed();

		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp!.updateIceParameters(iceParameters);

		if (!this._transportReady) {
			return;
		}

		if (this._direction === 'send') {
			const offer = await this._pc.createOffer({ iceRestart: true });

			logger.debug(
				'restartIce() | calling pc.setLocalDescription() [offer:%o]',
				offer
			);

			await this._pc.setLocalDescription(offer);

			const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

			logger.debug(
				'restartIce() | calling pc.setRemoteDescription() [answer:%o]',
				answer
			);

			await this._pc.setRemoteDescription(answer);
		} else {
			const offer = { type: 'offer', sdp: this._remoteSdp!.getSdp() };

			logger.debug(
				'restartIce() | calling pc.setRemoteDescription() [offer:%o]',
				offer
			);

			await this._pc.setRemoteDescription(offer);

			const answer = await this._pc.createAnswer();

			logger.debug(
				'restartIce() | calling pc.setLocalDescription() [answer:%o]',
				answer
			);

			await this._pc.setLocalDescription(answer);
		}
	}

	async getTransportStats(): Promise<RTCStatsReport> {
		this.assertNotClosed();

		return this._pc.getStats();
	}

	async send({
		track,
		encodings,
		codecOptions,
		codec,
		onRtpSender,
	}: HandlerSendOptions): Promise<HandlerSendResult> {
		this.assertNotClosed();
		this.assertSendDirection();

		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (encodings && encodings.length > 1) {
			encodings.forEach((encoding: RtpEncodingParameters, idx: number) => {
				encoding.rid = `r${idx}`;
			});
		}

		const sendingRtpParameters = utils.clone<RtpParameters>(
			this._sendingRtpParametersByKind![track.kind]
		);

		// This may throw.
		sendingRtpParameters.codecs = ortc.reduceCodecs(
			sendingRtpParameters.codecs,
			codec
		);

		const sendingRemoteRtpParameters = utils.clone<RtpParameters>(
			this._sendingRemoteRtpParametersByKind![track.kind]
		);

		// This may throw.
		sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(
			sendingRemoteRtpParameters.codecs,
			codec
		);

		const mediaSectionIdx = this._remoteSdp!.getNextMediaSectionIdx();
		const transceiver = this._pc.addTransceiver(track, {
			direction: 'sendonly',
			streams: [this._sendStream],
			sendEncodings: encodings,
		});

		if (onRtpSender) {
			onRtpSender(transceiver.sender);
		}

		let offer = await this._pc.createOffer();
		let localSdpObject = sdpTransform.parse(offer.sdp);
		let offerMediaObject;

		if (!this._transportReady) {
			await this.setupTransport({
				localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
				localSdpObject,
			});
		}

		// Special case for VP9 with SVC.
		let hackVp9Svc = false;

		const layers = parseScalabilityMode((encodings ?? [{}])[0].scalabilityMode);

		if (
			encodings &&
			encodings.length === 1 &&
			layers.spatialLayers > 1 &&
			sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9'
		) {
			logger.debug('send() | enabling legacy simulcast for VP9 SVC');

			hackVp9Svc = true;
			localSdpObject = sdpTransform.parse(offer.sdp);
			offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];

			sdpUnifiedPlanUtils.addLegacySimulcast({
				offerMediaObject,
				numStreams: layers.spatialLayers,
			});

			offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
		}

		logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		// We can now get the transceiver.mid.
		// NOTE: We cannot read generated MID on iOS react-native-webrtc 111.0.0
		// because transceiver.mid is not available until setRemoteDescription()
		// is called, so this is best effort.
		// Issue: https://github.com/react-native-webrtc/react-native-webrtc/issues/1404
		// NOTE: So let's fill MID in sendingRtpParameters later.
		// NOTE: This is fixed in react-native-webrtc 111.0.3.
		let localId = transceiver.mid ?? undefined;

		if (!localId) {
			logger.warn(
				'send() | missing transceiver.mid (bug in react-native-webrtc, using a workaround'
			);
		}

		// Set MID.
		// NOTE: As per above, it could be unset yet.
		sendingRtpParameters.mid = localId;

		localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
		offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];

		// Set RTCP CNAME.
		sendingRtpParameters.rtcp!.cname = sdpCommonUtils.getCname({
			offerMediaObject,
		});

		// Set RTP encodings by parsing the SDP offer if no encodings are given.
		if (!encodings) {
			sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
				offerMediaObject,
			});
		}
		// Set RTP encodings by parsing the SDP offer and complete them with given
		// one if just a single encoding has been given.
		else if (encodings.length === 1) {
			let newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({
				offerMediaObject,
			});

			Object.assign(newEncodings[0], encodings[0]);

			// Hack for VP9 SVC.
			if (hackVp9Svc) {
				newEncodings = [newEncodings[0]];
			}

			sendingRtpParameters.encodings = newEncodings;
		}
		// Otherwise if more than 1 encoding are given use them verbatim.
		else {
			sendingRtpParameters.encodings = encodings;
		}

		// If VP8 or H264 and there is effective simulcast, add scalabilityMode to
		// each encoding.
		if (
			sendingRtpParameters.encodings.length > 1 &&
			(sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
				sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
		) {
			for (const encoding of sendingRtpParameters.encodings) {
				if (encoding.scalabilityMode) {
					encoding.scalabilityMode = `L1T${layers.temporalLayers}`;
				} else {
					encoding.scalabilityMode = 'L1T3';
				}
			}
		}

		this._remoteSdp!.send({
			offerMediaObject,
			reuseMid: mediaSectionIdx.reuseMid,
			offerRtpParameters: sendingRtpParameters,
			answerRtpParameters: sendingRemoteRtpParameters,
			codecOptions,
			extmapAllowMixed: true,
		});

		const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'send() | calling pc.setRemoteDescription() [answer:%o]',
			answer
		);

		await this._pc.setRemoteDescription(answer);

		// Follow up of iOS react-native-webrtc 111.0.0 issue told above. Now yes,
		// we can read generated MID (if not done above) and fill sendingRtpParameters.
		// NOTE: This is fixed in react-native-webrtc 111.0.3 so this block isn't
		// needed starting from that version.
		if (!localId) {
			localId = transceiver.mid;
			sendingRtpParameters.mid = localId;
		}

		// Store in the map.
		this._mapMidTransceiver.set(localId, transceiver);

		return {
			localId,
			rtpParameters: sendingRtpParameters,
			rtpSender: transceiver.sender,
		};
	}

	async stopSending(localId: string): Promise<void> {
		this.assertSendDirection();

		if (this._closed) {
			return;
		}

		logger.debug('stopSending() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		void transceiver.sender.replaceTrack(null);

		this._pc.removeTrack(transceiver.sender);

		const mediaSectionClosed = this._remoteSdp!.closeMediaSection(
			transceiver.mid!
		);

		if (mediaSectionClosed) {
			try {
				transceiver.stop();
			} catch (error) {}
		}

		const offer = await this._pc.createOffer();

		logger.debug(
			'stopSending() | calling pc.setLocalDescription() [offer:%o]',
			offer
		);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'stopSending() | calling pc.setRemoteDescription() [answer:%o]',
			answer
		);

		await this._pc.setRemoteDescription(answer);

		this._mapMidTransceiver.delete(localId);
	}

	async pauseSending(localId: string): Promise<void> {
		this.assertNotClosed();
		this.assertSendDirection();

		logger.debug('pauseSending() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		transceiver.direction = 'inactive';
		this._remoteSdp!.pauseMediaSection(localId);

		const offer = await this._pc.createOffer();

		logger.debug(
			'pauseSending() | calling pc.setLocalDescription() [offer:%o]',
			offer
		);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'pauseSending() | calling pc.setRemoteDescription() [answer:%o]',
			answer
		);

		await this._pc.setRemoteDescription(answer);
	}

	async resumeSending(localId: string): Promise<void> {
		this.assertNotClosed();
		this.assertSendDirection();

		logger.debug('resumeSending() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		this._remoteSdp!.resumeSendingMediaSection(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		transceiver.direction = 'sendonly';

		const offer = await this._pc.createOffer();

		logger.debug(
			'resumeSending() | calling pc.setLocalDescription() [offer:%o]',
			offer
		);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'resumeSending() | calling pc.setRemoteDescription() [answer:%o]',
			answer
		);

		await this._pc.setRemoteDescription(answer);
	}

	async replaceTrack(
		localId: string,
		track: MediaStreamTrack | null
	): Promise<void> {
		this.assertNotClosed();
		this.assertSendDirection();

		if (track) {
			logger.debug(
				'replaceTrack() [localId:%s, track.id:%s]',
				localId,
				track.id
			);
		} else {
			logger.debug('replaceTrack() [localId:%s, no track]', localId);
		}

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		await transceiver.sender.replaceTrack(track);
	}

	async setMaxSpatialLayer(
		localId: string,
		spatialLayer: number
	): Promise<void> {
		this.assertNotClosed();
		this.assertSendDirection();

		logger.debug(
			'setMaxSpatialLayer() [localId:%s, spatialLayer:%s]',
			localId,
			spatialLayer
		);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		const parameters = transceiver.sender.getParameters();

		parameters.encodings.forEach(
			(encoding: RTCRtpEncodingParameters, idx: number) => {
				if (idx <= spatialLayer) {
					encoding.active = true;
				} else {
					encoding.active = false;
				}
			}
		);

		await transceiver.sender.setParameters(parameters);

		this._remoteSdp!.muxMediaSectionSimulcast(localId, parameters.encodings);

		const offer = await this._pc.createOffer();

		logger.debug(
			'setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]',
			offer
		);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]',
			answer
		);

		await this._pc.setRemoteDescription(answer);
	}

	async setRtpEncodingParameters(localId: string, params: any): Promise<void> {
		this.assertNotClosed();
		this.assertSendDirection();

		logger.debug(
			'setRtpEncodingParameters() [localId:%s, params:%o]',
			localId,
			params
		);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		const parameters = transceiver.sender.getParameters();

		parameters.encodings.forEach(
			(encoding: RTCRtpEncodingParameters, idx: number) => {
				parameters.encodings[idx] = { ...encoding, ...params };
			}
		);

		await transceiver.sender.setParameters(parameters);

		this._remoteSdp!.muxMediaSectionSimulcast(localId, parameters.encodings);

		const offer = await this._pc.createOffer();

		logger.debug(
			'setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]',
			offer
		);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
			answer
		);

		await this._pc.setRemoteDescription(answer);
	}

	async getSenderStats(localId: string): Promise<RTCStatsReport> {
		this.assertNotClosed();
		this.assertSendDirection();

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		return transceiver.sender.getStats();
	}

	async sendDataChannel({
		ordered,
		maxPacketLifeTime,
		maxRetransmits,
		label,
		protocol,
	}: HandlerSendDataChannelOptions): Promise<HandlerSendDataChannelResult> {
		this.assertNotClosed();
		this.assertSendDirection();

		const options = {
			negotiated: true,
			id: this._nextSendSctpStreamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			protocol,
		};

		logger.debug('sendDataChannel() [options:%o]', options);

		const dataChannel = this._pc.createDataChannel(label, options);

		// Increase next id.
		this._nextSendSctpStreamId =
			++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;

		// If this is the first DataChannel we need to create the SDP answer with
		// m=application section.
		if (!this._hasDataChannelMediaSection) {
			const offer = await this._pc.createOffer();
			const localSdpObject = sdpTransform.parse(offer.sdp);
			const offerMediaObject = localSdpObject.media.find(
				(m: any) => m.type === 'application'
			);

			if (!this._transportReady) {
				await this.setupTransport({
					localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
					localSdpObject,
				});
			}

			logger.debug(
				'sendDataChannel() | calling pc.setLocalDescription() [offer:%o]',
				offer
			);

			await this._pc.setLocalDescription(offer);

			this._remoteSdp!.sendSctpAssociation({ offerMediaObject });

			const answer = { type: 'answer', sdp: this._remoteSdp!.getSdp() };

			logger.debug(
				'sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
				answer
			);

			await this._pc.setRemoteDescription(answer);

			this._hasDataChannelMediaSection = true;
		}

		const sctpStreamParameters: SctpStreamParameters = {
			streamId: options.id,
			ordered: options.ordered,
			maxPacketLifeTime: options.maxPacketLifeTime,
			maxRetransmits: options.maxRetransmits,
		};

		return { dataChannel, sctpStreamParameters };
	}

	async receive(
		optionsList: HandlerReceiveOptions[]
	): Promise<HandlerReceiveResult[]> {
		this.assertNotClosed();
		this.assertRecvDirection();

		const results: HandlerReceiveResult[] = [];
		const mapLocalId: Map<string, string> = new Map();

		for (const options of optionsList) {
			const { trackId, kind, rtpParameters, streamId } = options;

			logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);

			const localId = rtpParameters.mid ?? String(this._mapMidTransceiver.size);

			mapLocalId.set(trackId, localId);

			this._remoteSdp!.receive({
				mid: localId,
				kind,
				offerRtpParameters: rtpParameters,
				streamId: streamId ?? rtpParameters.rtcp!.cname!,
				trackId,
			});
		}

		const offer = { type: 'offer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'receive() | calling pc.setRemoteDescription() [offer:%o]',
			offer
		);

		await this._pc.setRemoteDescription(offer);

		for (const options of optionsList) {
			const { trackId, onRtpReceiver } = options;

			if (onRtpReceiver) {
				const localId = mapLocalId.get(trackId);
				const transceiver = this._pc
					.getTransceivers()
					.find((t: RTCRtpTransceiver) => t.mid === localId);

				if (!transceiver) {
					throw new Error('transceiver not found');
				}

				onRtpReceiver(transceiver.receiver);
			}
		}

		let answer = await this._pc.createAnswer();
		const localSdpObject = sdpTransform.parse(answer.sdp);

		for (const options of optionsList) {
			const { trackId, rtpParameters } = options;
			const localId = mapLocalId.get(trackId);
			const answerMediaObject = localSdpObject.media.find(
				(m: any) => String(m.mid) === localId
			);

			// May need to modify codec parameters in the answer based on codec
			// parameters in the offer.
			sdpCommonUtils.applyCodecParameters({
				offerRtpParameters: rtpParameters,
				answerMediaObject,
			});
		}

		answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };

		if (!this._transportReady) {
			await this.setupTransport({
				localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
				localSdpObject,
			});
		}

		logger.debug(
			'receive() | calling pc.setLocalDescription() [answer:%o]',
			answer
		);

		await this._pc.setLocalDescription(answer);

		for (const options of optionsList) {
			const { trackId } = options;
			const localId = mapLocalId.get(trackId)!;
			const transceiver = this._pc
				.getTransceivers()
				.find((t: RTCRtpTransceiver) => t.mid === localId);

			if (!transceiver) {
				throw new Error('new RTCRtpTransceiver not found');
			} else {
				// Store in the map.
				this._mapMidTransceiver.set(localId, transceiver);

				results.push({
					localId,
					track: transceiver.receiver.track,
					rtpReceiver: transceiver.receiver,
				});
			}
		}

		return results;
	}

	async stopReceiving(localIds: string[]): Promise<void> {
		this.assertRecvDirection();

		if (this._closed) {
			return;
		}

		for (const localId of localIds) {
			logger.debug('stopReceiving() [localId:%s]', localId);

			const transceiver = this._mapMidTransceiver.get(localId);

			if (!transceiver) {
				throw new Error('associated RTCRtpTransceiver not found');
			}

			this._remoteSdp!.closeMediaSection(transceiver.mid!);
		}

		const offer = { type: 'offer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]',
			offer
		);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]',
			answer
		);

		await this._pc.setLocalDescription(answer);

		for (const localId of localIds) {
			this._mapMidTransceiver.delete(localId);
		}
	}

	async pauseReceiving(localIds: string[]): Promise<void> {
		this.assertNotClosed();
		this.assertRecvDirection();

		for (const localId of localIds) {
			logger.debug('pauseReceiving() [localId:%s]', localId);

			const transceiver = this._mapMidTransceiver.get(localId);

			if (!transceiver) {
				throw new Error('associated RTCRtpTransceiver not found');
			}

			transceiver.direction = 'inactive';
			this._remoteSdp!.pauseMediaSection(localId);
		}

		const offer = { type: 'offer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]',
			offer
		);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'pauseReceiving() | calling pc.setLocalDescription() [answer:%o]',
			answer
		);

		await this._pc.setLocalDescription(answer);
	}

	async resumeReceiving(localIds: string[]): Promise<void> {
		this.assertNotClosed();
		this.assertRecvDirection();

		for (const localId of localIds) {
			logger.debug('resumeReceiving() [localId:%s]', localId);

			const transceiver = this._mapMidTransceiver.get(localId);

			if (!transceiver) {
				throw new Error('associated RTCRtpTransceiver not found');
			}

			transceiver.direction = 'recvonly';
			this._remoteSdp!.resumeReceivingMediaSection(localId);
		}

		const offer = { type: 'offer', sdp: this._remoteSdp!.getSdp() };

		logger.debug(
			'resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]',
			offer
		);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'resumeReceiving() | calling pc.setLocalDescription() [answer:%o]',
			answer
		);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats(localId: string): Promise<RTCStatsReport> {
		this.assertNotClosed();
		this.assertRecvDirection();

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver) {
			throw new Error('associated RTCRtpTransceiver not found');
		}

		return transceiver.receiver.getStats();
	}

	async receiveDataChannel({
		sctpStreamParameters,
		label,
		protocol,
	}: HandlerReceiveDataChannelOptions): Promise<HandlerReceiveDataChannelResult> {
		this.assertNotClosed();
		this.assertRecvDirection();

		const {
			streamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
		}: SctpStreamParameters = sctpStreamParameters;

		const options = {
			negotiated: true,
			id: streamId,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			protocol,
		};

		logger.debug('receiveDataChannel() [options:%o]', options);

		const dataChannel = this._pc.createDataChannel(label, options);

		// If this is the first DataChannel we need to create the SDP offer with
		// m=application section.
		if (!this._hasDataChannelMediaSection) {
			this._remoteSdp!.receiveSctpAssociation();

			const offer = { type: 'offer', sdp: this._remoteSdp!.getSdp() };

			logger.debug(
				'receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]',
				offer
			);

			await this._pc.setRemoteDescription(offer);

			const answer = await this._pc.createAnswer();

			if (!this._transportReady) {
				const localSdpObject = sdpTransform.parse(answer.sdp);

				await this.setupTransport({
					localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
					localSdpObject,
				});
			}

			logger.debug(
				'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
				answer
			);

			await this._pc.setLocalDescription(answer);

			this._hasDataChannelMediaSection = true;
		}

		return { dataChannel };
	}

	private async setupTransport({
		localDtlsRole,
		localSdpObject,
	}: {
		localDtlsRole: DtlsRole;
		localSdpObject?: any;
	}): Promise<void> {
		if (!localSdpObject) {
			localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
		}

		// Get our local DTLS parameters.
		const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
			sdpObject: localSdpObject,
		});

		// Set our DTLS role.
		dtlsParameters.role = localDtlsRole;

		// Update the remote DTLS role in the SDP.
		this._remoteSdp!.updateDtlsRole(
			localDtlsRole === 'client' ? 'server' : 'client'
		);

		// Need to tell the remote transport about our parameters.
		await new Promise<void>((resolve, reject) => {
			this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
		});

		this._transportReady = true;
	}

	private assertNotClosed(): void {
		if (this._closed) {
			throw new InvalidStateError('method called in a closed handler');
		}
	}

	private assertSendDirection(): void {
		if (this._direction !== 'send') {
			throw new Error(
				'method can just be called for handlers with "send" direction'
			);
		}
	}

	private assertRecvDirection(): void {
		if (this._direction !== 'recv') {
			throw new Error(
				'method can just be called for handlers with "recv" direction'
			);
		}
	}
}
