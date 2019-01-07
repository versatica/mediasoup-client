const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { UnsupportedError, DuplicatedError } = require('../errors');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpPlanBUtils = require('./sdp/planBUtils');
const RemotePlanBSdp = require('./sdp/RemotePlanBSdp');

const logger = new Logger('ReactNative');

class Handler extends EnhancedEventEmitter
{
	constructor(
		{
			transportRemoteParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			sendingRtpParametersByKind,
			receivingRtpParametersByKind
		}
	)
	{
		super(logger);

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._sendingRtpParametersByKind = sendingRtpParametersByKind;

		// Generic receiving RTP parameters for audio and video.
		// @type {Object}
		this._receivingRtpParametersByKind = receivingRtpParametersByKind;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Remote SDP handler.
		// @type {RemotePlanBSdp}
		this._remoteSdp = new RemotePlanBSdp(
			{
				transportRemoteParameters,
				sendingRtpParametersByKind,
				receivingRtpParametersByKind
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

	async _setupTransport({ localDtlsRole } = {})
	{
		// Get our local DTLS parameters.
		const sdp = this._pc.localDescription.sdp;
		const sdpObj = sdpTransform.parse(sdp);
		const dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj);

		// Set our DTLS role.
		if (localDtlsRole)
			dtlsParameters.role = localDtlsRole;

		const transportLocalParameters = { dtlsParameters };

		// Need to tell the remote transport about our parameters.
		await this.safeEmitAsPromise('@connect', transportLocalParameters);

		this._transportReady = true;
	}
}

class SendHandler extends Handler
{
	constructor(data)
	{
		super(data);

		// Sending tracks.
		// @type {Set<MediaStreamTrack>}
		this._tracks = new Set();
	}

	async send({ track, simulcast })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (this._tracks.has(track))
			throw new DuplicatedError('track already handled');
		else if (!track.streamReactTag)
			throw new Error('missing track.streamReactTag property');

		// Hack: Create a new stream with track.streamReactTag as id.
		const stream = new MediaStream(track.streamReactTag);

		try
		{
			this._tracks.add(track);

			// Add the track to the stream.
			stream.addTrack(track);

			// Add the stream to the PeerConnection.
			this._pc.addStream(stream);

			let offer = await this._pc.createOffer();

			// If simulcast is set, mangle the offer.
			if (simulcast)
			{
				logger.debug('send() | enabling simulcast');

				const sdpObject = sdpTransform.parse(offer.sdp);

				sdpPlanBUtils.addSimulcastForTrack(
					sdpObject,
					track,
					{ numStreams: Object.keys(simulcast).length });

				const offerSdp = sdpTransform.write(sdpObject);

				offer = { type: 'offer', sdp: offerSdp };
			}

			logger.debug(
				'send() | calling pc.setLocalDescription() [offer:%o]', offer);

			const offerDesc = new RTCSessionDescription(offer);

			await this._pc.setLocalDescription(offerDesc);

			if (!this._transportReady)
				await this._setupTransport({ localDtlsRole: 'server' });

			const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
			const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
			const answer = { type: 'answer', sdp: remoteSdp };

			logger.debug(
				'send() | calling pc.setRemoteDescription() [answer:%o]', answer);

			const answerDesc = new RTCSessionDescription(answer);

			await this._pc.setRemoteDescription(answerDesc);

			const rtpParameters =
				utils.clone(this._sendingRtpParametersByKind[track.kind]);

			// Fill the RTP parameters for this track.
			sdpPlanBUtils.fillRtpParametersForTrack(rtpParameters, localSdpObj, track);

			return rtpParameters;
		}
		catch (error)
		{
			// Panic here. Try to undo things.

			this._tracks.delete(track);
			stream.removeTrack(track);
			this._pc.removeStream(stream);

			throw error;
		}
	}

	async stopSending({ track })
	{
		logger.debug('stopSending() [track.id:%s]', track.id);

		if (!track.streamReactTag)
			throw new Error('missing track.streamReactTag property');

		// Remove the track from the Set.
		this._tracks.delete(track);

		// Hack: Create a new stream with track.streamReactTag as id.
		const stream = new MediaStream(track.streamReactTag);

		// Add the track to the stream.
		stream.addTrack(track);

		// Remove the stream from the PeerConnection.
		this._pc.removeStream(stream);

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
			if (this._tracks.size === 0)
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

		const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
		const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
		const answer = { type: 'answer', sdp: remoteSdp };

		logger.debug(
			'stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);

		const answerDesc = new RTCSessionDescription(answer);

		await this._pc.setRemoteDescription(answerDesc);
	}

	async replaceTrack({ track, newTrack }) // eslint-disable-line no-unused-vars
	{
		logger.debug('replaceTrack() [newTrack.id:%s]', newTrack.id);

		throw new UnsupportedError('not implemented');
	}

	async setMaxSpatialLayer({ track, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		throw new UnsupportedError('not supported');
	}

	async getSenderStats({ track }) // eslint-disable-line no-unused-vars
	{
		throw new UnsupportedError('not implemented');
	}

	async restartIce({ remoteIceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp
			.updateTransportRemoteIceParameters(remoteIceParameters);

		if (!this._transportReady)
			return;

		const offer = this._pc.createOffer({ iceRestart: true });

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
		const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
		const answer = { type: 'answer', sdp: remoteSdp };

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

	async receive({ id, kind, rtpParameters })
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

		const remoteSdp = this._remoteSdp.createOfferSdp(
			Array.from(this._kinds), Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: remoteSdp };

		logger.debug(
			'receive() | calling pc.setRemoteDescription() [offer:%o]', offer);

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

		const answer = await this._pc.createAnswer();

		logger.debug(
			'receive() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);

		if (!this._transportUpdated)
			await this._setupTransport({ localDtlsRole: 'client' });

		const stream = this._pc.getRemoteStreams()
			.find((s) => s.id === receiverInfo.streamId);
		const track = stream.getTrackById(receiverInfo.trackId);

		if (!track)
			throw new Error('remote track not found');

		// Hack: Add a streamReactTag property with the reactTag of the MediaStream
		// generated by react-native-webrtc (this is needed because react-native-webrtc
		// assumes that we're gonna use the streams generated by it).
		track.streamReactTag = stream.reactTag;

		return track;
	}

	async stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		if (!this._receiverInfos.has(id))
			throw new Error('source not found');

		this._receiverInfos.delete(id);

		const remoteSdp = this._remoteSdp.createOfferSdp(
			Array.from(this._kinds), Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: remoteSdp };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]',
			offer);

		await this._pc.setRemoteDescription(offer);

		const answer = this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]',
			answer);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats({ track }) // eslint-disable-line no-unused-vars
	{
		throw new UnsupportedError('not implemented');
	}

	async restartIce({ remoteIceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp
			.updateTransportRemoteIceParameters(remoteIceParameters);

		if (!this._transportReady)
			return;

		const remoteSdp = this._remoteSdp.createOfferSdp(
			Array.from(this._kinds), Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: remoteSdp };

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

class ReactNative
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

			const sdpObj = sdpTransform.parse(offer.sdp);
			const nativeRtpCapabilities =
				sdpCommonUtils.extractRtpCapabilities(sdpObj);

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
			transportRemoteParameters,
			direction,
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

				return new SendHandler(
					{
						transportRemoteParameters,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints,
						sendingRtpParametersByKind
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
						transportRemoteParameters,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints,
						receivingRtpParametersByKind
					});
			}
		}
	}
}

module.exports = ReactNative;
