const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { UnsupportedError, DuplicatedError } = require('../errors');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpPlanBUtils = require('./sdp/planBUtils');
const RemoteSdp = require('./sdp/RemoteSdp');

const logger = new Logger('Chrome69');

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
	constructor(
		{
			sendingRtpParametersByKind,
			sendingRemoteRtpParametersByKind,
			...data
		}
	)
	{
		super(data);

		// Generic sending RTP parameters for audio and video.
		// @type {RTCRtpParameters}
		this._sendingRtpParametersByKind = sendingRtpParametersByKind;

		// Generic sending RTP parameters for audio and video suitable for the SDP
		// remote answer.
		// @type {RTCRtpParameters}
		this._sendingRemoteRtpParametersByKind = sendingRemoteRtpParametersByKind;

		// Local stream.
		// @type {MediaStream}
		this._stream = new MediaStream();
	}

	async send({ track, encodings, codecOptions })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		this._stream.addTrack(track);
		this._pc.addTrack(track, this._stream);

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

		await this._pc.setLocalDescription(offer);

		localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
		offerMediaObject = localSdpObject.media[localSdpObject.media.length - 1];

		// Set RTCP CNAME.
		sendingRtpParameters.rtcp.cname =
			sdpCommonUtils.getCname({ offerMediaObject });

		// Set RTP encodings.
		sendingRtpParameters.encodings =
			sdpPlanBUtils.getRtpEncodings({ offerMediaObject, track });

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

		await this._pc.setRemoteDescription(answer);

		const localId = track.id;

		return { localId, rtpParameters: sendingRtpParameters };
	}

	async stopSending({ localId })
	{
		logger.debug('stopSending() [localId:%s]', localId);

		const track = this._stream.getTrackById(localId);
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			throw new Error('associated rtpSender found');

		this._pc.removeTrack(rtpSender);
		this._stream.removeTrack(track);

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

		await this._pc.setRemoteDescription(answer);
	}

	async replaceTrack({ track, newTrack })
	{
		logger.debug('replaceTrack() [newTrack.id:%s]', newTrack.id);

		if (this._stream.getTrackById(newTrack.id))
			throw new DuplicatedError('track already added');

		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			throw new Error('local track not found');

		await rtpSender.replaceTrack(newTrack);

		// Remove the old track from the local stream.
		this._stream.removeTrack(track);

		// Add the new track to the local stream.
		this._stream.addTrack(newTrack);
	}

	async setMaxSpatialLayer({ track, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		throw new UnsupportedError('not supported');
	}

	async getSenderStats({ track })
	{
		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			throw new Error('local track not found');

		return rtpSender.getStats();
	}

	async restartIce({ iceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateTransportRemoteIceParameters(iceParameters);

		if (!this._transportReady)
			return;

		const offer = await this._pc.createOffer({ iceRestart: true });

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
		const remoteSdpObj = this._remoteSdp.createAnswerSdpObject(localSdpObj);
		const answer = { type: 'answer', sdp: sdpTransform.write(remoteSdpObj) };

		logger.debug(
			'restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);

		await this._pc.setRemoteDescription(answer);
	}
}

class RecvHandler extends Handler
{
	constructor(data)
	{
		super(data);

		// Seen media kinds.
		// @type {Set<String>}
		this._kinds = new Set();

		// Map of receivers information indexed by id.
		// - kind {String}
		// - trackId {String}
		// - ssrc {Number}
		// - rtxSsrc {Number}
		// - cname {String}
		// @type {Map<String, Object>}
		this._receiverInfos = new Map();
	}

	async receive({ id, kind, rtpParameters, codecOptions })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._receiverInfos.has(id))
			throw new DuplicatedError('already receiving this source');

		const encoding = rtpParameters.encodings[0];
		const cname = rtpParameters.rtcp.cname;
		const receiverInfo =
		{
			kind     : kind,
			streamId : id,
			trackId  : `${kind}-${id}`,
			ssrc     : encoding.ssrc,
			cname    : cname
		};

		if (encoding.rtx && encoding.rtx.ssrc)
			receiverInfo.rtxSsrc = encoding.rtx.ssrc;

		this._receiverInfos.set(id, receiverInfo);
		this._kinds.add(kind);

		const remoteSdpObj = this._remoteSdp.createOfferSdpObject(
			Array.from(this._kinds), Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: sdpTransform.write(remoteSdpObj) };

		logger.debug(
			'receive() | calling pc.setRemoteDescription() [offer:%o]',
			offer);

		try
		{
			await this._pc.setRemoteDescription(offer);
		}
		catch (error)
		{
			// Panic here. Try to undo things.

			this._receiverInfos.delete(id);

			throw error;
		}

		const applyCodecOptions = Object.keys(codecOptions).length > 0;
		let answer = await this._pc.createAnswer();
		const localSdpObj = sdpTransform.parse(answer.sdp);

		if (applyCodecOptions)
		{
			sdpCommonUtils.setCodecParameters(
				{
					sdpObj    : localSdpObj,
					direction : 'recv',
					kind,
					rtpParameters,
					...codecOptions
				});
		}

		answer = { type: 'answer', sdp: sdpTransform.write(localSdpObj) };

		logger.debug(
			'receive() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client' });

		const newRtpReceiver = this._pc.getReceivers()
			.find((rtpReceiver) =>
			{
				const { track } = rtpReceiver;

				if (!track)
					return false;

				return track.id === receiverInfo.trackId;
			});

		if (!newRtpReceiver)
			throw new Error('remote track not found');

		return newRtpReceiver.track;
	}

	async stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		if (!this._receiverInfos.has(id))
			throw new Error('source not found');

		this._receiverInfos.delete(id);

		const remoteSdpObj = this._remoteSdp.createOfferSdpObject(
			Array.from(this._kinds), Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: sdpTransform.write(remoteSdpObj) };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]',
			offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]',
			answer);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats({ id })
	{
		const receiverInfo = this._receiverInfos.get(id);

		if (!receiverInfo)
			throw new Error('receiver not found');

		const { trackId } = receiverInfo;

		// Get the associated RTCRtpReceiver.
		const rtpReceiver = this._pc.getReceivers()
			.find((r) => r.track && r.track.id === trackId);

		if (!rtpReceiver)
			throw new Error('RTCRtpReceiver not found');

		return rtpReceiver.getStats();
	}

	async restartIce({ iceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateTransportRemoteIceParameters(iceParameters);

		if (!this._transportReady)
			return;

		const remoteSdpObj = this._remoteSdp.createOfferSdpObject(
			Array.from(this._kinds), Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: sdpTransform.write(remoteSdpObj) };

		logger.debug(
			'restartIce() | calling pc.setRemoteDescription() [offer:%o]',
			offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [answer:%o]',
			answer);

		await this._pc.setLocalDescription(answer);
	}
}

class Chrome69
{
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
				const receivingRtpParametersByKind =
				{
					audio : ortc.getReceivingFullRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getReceivingFullRtpParameters('video', extendedRtpCapabilities)
				};

				return new RecvHandler(
					{
						iceParameters,
						iceCandidates,
						dtlsParameters,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints,
						receivingRtpParametersByKind
					});
			}
		}
	}
}

module.exports = Chrome69;
