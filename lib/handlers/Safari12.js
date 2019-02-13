const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { DuplicatedError } = require('../errors');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpUnifiedPlanUtils = require('./sdp/unifiedPlanUtils');
const RemoteUnifiedPlanSdp = require('./sdp/RemoteUnifiedPlanSdp');

const logger = new Logger('Safari12');

class Handler extends EnhancedEventEmitter
{
	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			sendingRtpParametersByKind,
			sendingRemoteRtpParametersByKind
		}
	)
	{
		super(logger);

		// Generic sending RTP parameters for audio and video.
		// @type {RTCRtpParameters}
		this._sendingRtpParametersByKind = sendingRtpParametersByKind;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Remote SDP handler.
		// @type {RemoteUnifiedPlanSdp}
		this._remoteSdp = new RemoteUnifiedPlanSdp(
			{
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sendingRemoteRtpParametersByKind
			});

		// RTCPeerConnection instance.
		// @type {RTCPeerConnection}
		this._pc = new RTCPeerConnection(
			{
				iceServers         : iceServers || [],
				iceTransportPolicy : iceTransportPolicy || 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require',
				sdpSemantics       : 'unified-plan'
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

	async _setupTransport({ localDtlsRole })
	{
		// Get our local DTLS parameters.
		const sdp = this._pc.localDescription.sdp;
		const sdpObj = sdpTransform.parse(sdp);
		const dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj);

		// Set our DTLS role.
		dtlsParameters.role = localDtlsRole;

		// Update the remote DTLS role in the SDP.
		this._remoteSdp.updateTransportRemoteDtlsRole(
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

		// Sending tracks.
		// @type {Set<MediaStreamTrack>}
		this._tracks = new Set();
	}

	async send({ track, encodings })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (this._tracks.has(track))
			throw new DuplicatedError('track already handled');

		let transceiver;

		try
		{
			transceiver = this._pc.addTransceiver(track, { direction: 'sendonly' });

			let offer = await this._pc.createOffer();

			if (encodings && encodings.length > 1)
			{
				logger.debug('send() | enabling simulcast');

				const sdpObject = sdpTransform.parse(offer.sdp);

				sdpUnifiedPlanUtils.addLegacySimulcast(
					sdpObject,
					track,
					{
						numStreams : encodings.length,
						mid        : transceiver.mid
					});

				const offerSdp = sdpTransform.write(sdpObject);

				offer = { type: 'offer', sdp: offerSdp };
			}

			logger.debug(
				'send() | calling pc.setLocalDescription() [offer:%o]', offer);

			await this._pc.setLocalDescription(offer);

			if (!this._transportReady)
				await this._setupTransport({ localDtlsRole: 'server' });

			const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
			const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
			const answer = { type: 'answer', sdp: remoteSdp };

			logger.debug(
				'send() | calling pc.setRemoteDescription() [answer:%o]', answer);

			await this._pc.setRemoteDescription(answer);

			const rtpParameters =
				utils.clone(this._sendingRtpParametersByKind[track.kind]);

			sdpUnifiedPlanUtils.fillRtpParametersForTrack(
				rtpParameters,
				localSdpObj,
				track,
				{ mid: transceiver.mid, legacySimulcast: true });

			this._tracks.add(track);

			return rtpParameters;
		}
		catch (error)
		{
			// Panic here. Try to undo things.
			try
			{
				transceiver.direction = 'inactive';
				transceiver.sender.replaceTrack(null);
			}
			catch (error2) {}

			throw error;
		}
	}

	async stopSending({ track })
	{
		logger.debug('stopSending() [track.id:%s]', track.id);

		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			throw new Error('local track not found');

		this._pc.removeTrack(rtpSender);

		const offer = await this._pc.createOffer();

		logger.debug(
			'stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
		const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
		const answer = { type: 'answer', sdp: remoteSdp };

		logger.debug(
			'stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);

		this._tracks.delete(track);

		await this._pc.setRemoteDescription(answer);
	}

	async replaceTrack({ track, newTrack })
	{
		logger.debug('replaceTrack() [newTrack.id:%s]', newTrack.id);

		if (this._tracks.has(newTrack))
			throw new DuplicatedError('track already handled');

		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			throw new Error('local track not found');

		await rtpSender.replaceTrack(newTrack);

		this._tracks.delete(track);
		this._tracks.add(newTrack);
	}

	async setMaxSpatialLayer({ track, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			throw new Error('local track not found');

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

		// Map of receivers information indexed by id.
		// - mid {String}
		// - kind {String}
		// - closed {Boolean}
		// - trackId {String}
		// - rtpParameters {RTCRtpParameters}
		// @type {Map<String, Object>}
		this._receiverInfos = new Map();

		// MID value counter. It must be converted to string and incremented for
		// each new m= section.
		// @type {Number}
		this._nextMid = 0;
	}

	async receive({ id, kind, rtpParameters })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._receiverInfos.has(id))
			throw new DuplicatedError('already receiving this source');

		const receiverInfo =
		{
			mid           : String(this._nextMid++),
			kind          : kind,
			closed        : false,
			streamId      : id,
			trackId       : `${kind}-${id}`,
			rtpParameters : rtpParameters
		};

		this._receiverInfos.set(id, receiverInfo);

		try
		{
			const remoteSdp = this._remoteSdp.createOfferSdp(
				Array.from(this._receiverInfos.values()));
			const offer = { type: 'offer', sdp: remoteSdp };

			logger.debug(
				'receive() | calling pc.setRemoteDescription() [offer:%o]', offer);

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

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client' });

		const transceiver = this._pc.getTransceivers()
			.find((t) => t.mid === receiverInfo.mid);

		if (!transceiver)
			throw new Error('remote track not found');

		return transceiver.receiver.track;
	}

	async stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		const receiverInfo = this._receiverInfos.get(id);

		if (!receiverInfo)
			throw new Error('receiver not found');

		receiverInfo.closed = true;

		const remoteSdp = this._remoteSdp.createOfferSdp(
			Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: remoteSdp };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats({ id })
	{
		const receiverInfo = this._receiverInfos.get(id);

		if (!receiverInfo)
			throw new Error('receiver not found');

		const { mid } = receiverInfo;

		// Get the associated RTCRtpTransceiver.
		const transceiver = this._pc.getTransceivers()
			.find((t) => t.mid === mid);

		if (!transceiver)
			throw new Error('transceiver not found');

		return transceiver.receiver.getStats();
	}

	async restartIce({ iceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateTransportRemoteIceParameters(iceParameters);

		if (!this._transportReady)
			return;

		const remoteSdp = this._remoteSdp.createOfferSdp(
			Array.from(this._receiverInfos.values()));
		const offer = { type: 'offer', sdp: remoteSdp };

		logger.debug(
			'restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}
}

class Safari12
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
				sdpSemantics       : 'unified-plan'
			});

		try
		{
			pc.addTransceiver('audio');
			pc.addTransceiver('video');

			const offer = await pc.createOffer();

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

module.exports = Safari12;
