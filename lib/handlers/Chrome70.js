const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpUnifiedPlanUtils = require('./sdp/unifiedPlanUtils');
const RemoteUnifiedPlanSdp = require('./sdp/RemoteUnifiedPlanSdp');

const logger = new Logger('Chrome70');

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
		// @type {RemoteUnifiedPlanSdp}
		this._remoteSdp = new RemoteUnifiedPlanSdp(
			{
				iceParameters,
				iceCandidates,
				dtlsParameters
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

		// Map of RTCTransceivers indexed by MID.
		// @type {Map<String, RTCTransceiver>}
		this._mapMidTransceiver = new Map();

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
		const dtlsParameters = sdpCommonUtils.extractDtlsParameters({ sdpObj });

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
	}

	async send({ track, encodings, codecOptions })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		let transceiver;

		try
		{
			transceiver = this._pc.addTransceiver(track, { direction: 'sendonly' });

			let offer = await this._pc.createOffer();
			let localSdpObj = sdpTransform.parse(offer.sdp);
			const sendingRtpParameters =
				utils.clone(this._sendingRtpParametersByKind[track.kind]);

			if (encodings && encodings.length > 1)
			{
				logger.debug('send() | enabling simulcast');

				localSdpObj = sdpTransform.parse(offer.sdp);

				sdpUnifiedPlanUtils.addLegacySimulcast(
					{
						sdpObj     : localSdpObj,
						track,
						numStreams : encodings.length
					});

				offer = { type: 'offer', sdp: sdpTransform.write(localSdpObj) };
			}

			logger.debug(
				'send() | calling pc.setLocalDescription() [offer:%o]', offer);

			await this._pc.setLocalDescription(offer);

			// Now we got the MID.
			const localId = transceiver.mid;

			if (!this._transportReady)
				await this._setupTransport({ localDtlsRole: 'server' });

			localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);

			this._remoteSdp.send(
				{
					// We know that the new transceiver has been created in a new m= section.
					offerMediaObject    : localSdpObj.media[localSdpObj.media.length - 1],
					offerRtpParameters  : sendingRtpParameters,
					answerRtpParameters : this._sendingRemoteRtpParametersByKind[track.kind],
					codecOptions
				});

			const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

			logger.debug(
				'send() | calling pc.setRemoteDescription() [answer:%o]', answer);

			await this._pc.setRemoteDescription(answer);

			sdpUnifiedPlanUtils.fillRtpParametersForTrack(
				{
					rtpParameters   : sendingRtpParameters,
					sdpObj          : localSdpObj,
					mid             : transceiver.mid,
					track,
					legacySimulcast : true
				});

			// Store in the map.
			this._mapMidTransceiver.set(localId, transceiver);

			return { localId, rtpParameters: sendingRtpParameters };
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

	async stopSending({ localId })
	{
		logger.debug('stopSending() [localId.id:%s]', localId.id);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		this._remoteSdp.disableMediaSection(transceiver.mid);
		this._pc.removeTrack(transceiver.sender);

		const offer = await this._pc.createOffer();

		logger.debug(
			'stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);

		await this._pc.setLocalDescription(offer);

		const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);

		await this._pc.setRemoteDescription(answer);
	}

	async replaceTrack({ localId, track })
	{
		logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		await transceiver.sender.replaceTrack(track);
	}

	async setMaxSpatialLayer({ localId, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [localId:%s, spatialLayer:%s]',
			localId, spatialLayer);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		const parameters = transceiver.sender.getParameters();

		parameters.encodings
			.forEach((encoding, idx) =>
			{
				if (idx <= spatialLayer)
					encoding.active = true;
				else
					encoding.active = false;
			});

		await transceiver.sender.setParameters(parameters);
	}

	async getSenderStats({ localId })
	{
		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		return transceiver.sender.getStats();
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

		await this._pc.setRemoteDescription(answer);
	}
}

class RecvHandler extends Handler
{
	constructor(data)
	{
		super(data);

		// MID value counter. It must be converted to string and incremented for
		// each new m= section.
		// @type {Number}
		this._nextMid = 0;
	}

	async receive({ id, kind, rtpParameters })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		const localId = String(this._nextMid);

		this._remoteSdp.receive(
			{
				mid                : localId,
				kind,
				offerRtpParameters : rtpParameters,
				streamId           : id,
				trackId            : id
			});

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'receive() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'receive() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client' });

		const transceiver = this._pc.getTransceivers()
			.find((t) => t.mid === localId);

		if (!transceiver)
			throw new Error('remote track not found');

		// Store in the map.
		this._mapMidTransceiver.set(localId, transceiver);

		// Increase next MID.
		this._nextMid++;

		return { localId, track: transceiver.receiver.track };
	}

	async stopReceiving({ localId })
	{
		logger.debug('stopReceiving() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		this._remoteSdp.disableMediaSection(transceiver.mid);

		const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };

		logger.debug(
			'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}

	async getReceiverStats({ localId })
	{
		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated transceiver not found');

		return transceiver.receiver.getStats();
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

		await this._pc.setRemoteDescription(offer);

		const answer = await this._pc.createAnswer();

		logger.debug(
			'restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);

		await this._pc.setLocalDescription(answer);
	}
}

class Chrome70
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
				sdpCommonUtils.extractRtpCapabilities({ sdpObj });

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

module.exports = Chrome70;
