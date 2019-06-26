const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { UnsupportedError } = require('../errors');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpPlanBUtils = require('./sdp/planBUtils');
const RemoteSdp = require('./sdp/RemoteSdp');

const logger = new Logger('ReactNative');

class Handler extends EnhancedEventEmitter
{
	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints
		}
	)
	{
		super(logger);

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Remote SDP handler.
		// @type {RemoteSdp}
		this._remoteSdp = new RemoteSdp(
			{
				iceParameters,
				iceCandidates,
				dtlsParameters,
				planB : true
			});

		// RTCPeerConnection instance.
		// @type {RTCPeerConnection}
		this._pc = new RTCPeerConnection(
			{
				iceServers         : iceServers || [],
				iceTransportPolicy : iceTransportPolicy || 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require',
				sdpSemantics       : 'plan-b'
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

	close()
	{
		logger.debug('close()');

		// Close RTCPeerConnection.
		try { this._pc.close(); }
		catch (error) {}
	}

	async getTransportStats()
	{
		return this._pc.getStats();
	}

	async updateIceServers({ iceServers })
	{
		logger.debug('updateIceServers()');

		const configuration = this._pc.getConfiguration();

		configuration.iceServers = iceServers;

		this._pc.setConfiguration(configuration);
	}

	async _setupTransport({ localDtlsRole, localSdpObject = null })
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
	constructor(data)
	{
		super(data);

		// Generic sending RTP parameters for audio and video.
		// @type {RTCRtpParameters}
		this._sendingRtpParametersByKind = data.sendingRtpParametersByKind;

		// Generic sending RTP parameters for audio and video suitable for the SDP
		// remote answer.
		// @type {RTCRtpParameters}
		this._sendingRemoteRtpParametersByKind = data.sendingRemoteRtpParametersByKind;

		// Map of MediaStreamTracks indexed by localId.
		// @type {Map<Number, MediaStreamTracks>}
		this._mapIdTrack = new Map();

		// Latest localId.
		// @type {Number}
		this._lastId = 0;
	}

	async send({ track, encodings, codecOptions })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (!track.streamReactTag)
			throw new Error('missing track.streamReactTag property');

		// Hack: Create a new stream with track.streamReactTag as id.
		const stream = new MediaStream(track.streamReactTag);

		stream.addTrack(track);
		this._pc.addStream(stream);

		let offer = await this._pc.createOffer();
		let localSdpObject = sdpTransform.parse(offer.sdp);
		let offerMediaObject;
		const sendingRtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind]);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

		if (track.kind === 'video' && encodings && encodings.length > 1)
		{
			logger.debug('send() | enabling simulcast');

			localSdpObject = sdpTransform.parse(offer.sdp);
			offerMediaObject = localSdpObject.media
				.find((m) => m.type === 'video');

			sdpPlanBUtils.addLegacySimulcast(
				{
					offerMediaObject,
					track,
					numStreams : encodings.length
				});

			offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
		}

		logger.debug(
			'send() | calling pc.setLocalDescription() [offer:%o]', offer);

		const offerDesc = new RTCSessionDescription(offer);

		await this._pc.setLocalDescription(offerDesc);

		localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
		offerMediaObject = localSdpObject.media
			.find((m) => m.type === track.kind);

		// Set RTCP CNAME.
		sendingRtpParameters.rtcp.cname =
			sdpCommonUtils.getCname({ offerMediaObject });

		// Set RTP encodings.
		sendingRtpParameters.encodings =
			sdpPlanBUtils.getRtpEncodings({ offerMediaObject, track });

		// Complete encodings with given values.
		if (encodings)
		{
			for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx)
			{
				if (encodings[idx])
					Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
			}
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
				offerRtpParameters  : sendingRtpParameters,
				answerRtpParameters : this._sendingRemoteRtpParametersByKind[track.kind],
				codecOptions
			});

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'send() | calling pc.setRemoteDescription() [answer:%o]', answer);

		const answerDesc = new RTCSessionDescription(answer);

		await this._pc.setRemoteDescription(answerDesc);

		this._lastId++;

		// Insert into the map.
		this._mapIdTrack.set(this._lastId, track);

		return { localId: this._lastId, rtpParameters: sendingRtpParameters };
	}

	async stopSending({ localId })
	{
		logger.debug('stopSending() [localId:%s]', localId);

		const track = this._mapIdTrack.get(localId);

		if (!track)
			throw new Error('track not found');

		this._mapIdTrack.delete(localId);

		// Hack: Create a new stream with track.streamReactTag as id.
		const stream = new MediaStream(track.streamReactTag);

		stream.removeTrack(track);
		this._pc.addStream(stream);

		const offer = await this._pc.createOffer();

		logger.debug(
			'stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);

		try
		{
			await this._pc.setLocalDescription(offer);
		}
		catch (error)
		{
			// NOTE: If there are no sending tracks, setLocalDescription() will fail with
			// "Failed to create channels". If so, ignore it.
			if (this._stream.getTracks().length === 0)
			{
				logger.warn(
					'stopSending() | ignoring expected error due no sending tracks: %s',
					error.toString());

				return;
			}

			throw error;
		}

		if (this._pc.signalingState === 'stable')
			return;

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);

		const answerDesc = new RTCSessionDescription(answer);

		await this._pc.setRemoteDescription(answerDesc);
	}

	async replaceTrack({ localId, track }) // eslint-disable-line no-unused-vars
	{
		throw new UnsupportedError('not implemented');
	}

	// eslint-disable-next-line no-unused-vars
	async setMaxSpatialLayer({ localId, spatialLayer })
	{
		throw new UnsupportedError('not supported');
	}

	async getSenderStats({ localId }) // eslint-disable-line no-unused-vars
	{
		throw new UnsupportedError('not implemented');
	}

	async restartIce({ iceParameters })
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

		const answerDesc = new RTCSessionDescription(answer);

		await this._pc.setRemoteDescription(answerDesc);
	}
}

class RecvHandler extends Handler
{
	constructor(data)
	{
		super(data);

		// Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
		// Value is an Object with mid and rtpParameters.
		// @type {Map<String, Object>}
		this._mapIdRtpParameters = new Map();
	}

	async receive({ id, kind, rtpParameters })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		const localId = id;
		const mid = kind;
		const streamId = rtpParameters.rtcp.cname;

		this._remoteSdp.receive(
			{
				mid,
				kind,
				offerRtpParameters : rtpParameters,
				streamId,
				trackId            : localId
			});

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'receive() | calling pc.setRemoteDescription() [offer:%o]', offer);

		const offerDesc = new RTCSessionDescription(offer);

		await this._pc.setRemoteDescription(offerDesc);

		let answer = await this._pc.createAnswer();
		const localSdpObject = sdpTransform.parse(answer.sdp);
		const answerMediaObject = localSdpObject.media
			.find((m) => String(m.mid) === mid);

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

		const answerDesc = new RTCSessionDescription(answer);

		await this._pc.setLocalDescription(answerDesc);

		const stream = this._pc.getRemoteStreams()
			.find((s) => s.id === streamId);
		const track = stream.getTrackById(localId);

		if (!track)
			throw new Error('remote track not found');

		// Insert into the map.
		this._mapIdRtpParameters.set(localId, { mid, rtpParameters });

		// Hack: Add a streamReactTag property with the reactTag of the MediaStream
		// generated by react-native-webrtc (this is needed because react-native-webrtc
		// assumes that we're gonna use the streams generated by it).
		track.streamReactTag = stream.reactTag;

		return { localId, track };
	}

	async stopReceiving({ localId })
	{
		logger.debug('stopReceiving() [localId:%s]', localId);

		const { mid, rtpParameters } = this._mapIdRtpParameters.get(localId);

		// Remove from the map.
		this._mapIdRtpParameters.delete(localId);

		this._remoteSdp.planBStopReceiving(
			{ mid, offerRtpParameters: rtpParameters });

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);

		const offerDesc = new RTCSessionDescription(offer);

		await this._pc.setRemoteDescription(offerDesc);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats({ localId }) // eslint-disable-line no-unused-vars
	{
		throw new UnsupportedError('not implemented');
	}

	async restartIce({ iceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateIceParameters(iceParameters);

		if (!this._transportReady)
			return;

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);

		const offerDesc = new RTCSessionDescription(offer);

		await this._pc.setRemoteDescription(offerDesc);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}
}

class ReactNative
{
	static get name()
	{
		return 'ReactNative';
	}

	static async getNativeRtpCapabilities()
	{
		logger.debug('getNativeRtpCapabilities()');

		const pc = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require',
				sdpSemantics       : 'plan-b'
			});

		try
		{
			const offer = await pc.createOffer(
				{
					offerToReceiveAudio : true,
					offerToReceiveVideo : true
				});

			try { pc.close(); }
			catch (error) {}

			const sdpObject = sdpTransform.parse(offer.sdp);
			const nativeRtpCapabilities =
				sdpCommonUtils.extractRtpCapabilities({ sdpObject });

			return nativeRtpCapabilities;
		}
		catch (error)
		{
			try { pc.close(); }
			catch (error2) {}

			throw error;
		}
	}

	constructor(
		{
			direction,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			extendedRtpCapabilities
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
						iceServers,
						iceTransportPolicy,
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
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints
					});
			}
		}
	}
}

module.exports = ReactNative;
