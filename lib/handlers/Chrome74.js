const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpUnifiedPlanUtils = require('./sdp/unifiedPlanUtils');
const RemoteSdp = require('./sdp/RemoteSdp');
const parseScalabilityMode = require('../scalabilityModes').parse;

const logger = new Logger('Chrome74');

const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };

class Handler extends EnhancedEventEmitter
{
	constructor(
		{
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
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
				sctpParameters
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

		// Whether a DataChannel m=application section has been created.
		// @type {Boolean}
		this._hasDataChannelMediaSection = false;

		// DataChannel id value counter. It must be incremented for each new DataChannel.
		// @type {Number}
		this._nextSctpStreamId = 0;

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

		// Local stream.
		// @type {MediaStream}
		this._stream = new MediaStream();
	}

	async send({ track, encodings, codecOptions })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (encodings && encodings.length > 1)
		{
			encodings.forEach((encoding, idx) =>
			{
				encoding.rid = `r${idx}`;
			});
		}

		const transceiver = this._pc.addTransceiver(
			track,
			{
				direction     : 'sendonly',
				streams       : [ this._stream ],
				sendEncodings : encodings
			});
		let offer = await this._pc.createOffer();
		let localSdpObject = sdpTransform.parse(offer.sdp);
		let offerMediaObject;
		const sendingRtpParameters =
			utils.clone(this._sendingRtpParametersByKind[track.kind]);

		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server', localSdpObject });

		logger.debug(
			'send() | calling pc.setLocalDescription() [offer:%o]', offer);

		// Special case for VP9 with SVC.
		let hackVp9Svc = false;

		const layers =
			parseScalabilityMode((encodings || [ {} ])[0].scalabilityMode);

		if (
			encodings &&
			encodings.length === 1 &&
			layers.spatialLayers > 1 &&
			sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9'
		)
		{
			logger.debug('send() | enabling legacy simulcast for VP9 SVC');

			hackVp9Svc = true;
			localSdpObject = sdpTransform.parse(offer.sdp);
			// We know that our media section is the last one.
			offerMediaObject = localSdpObject.media[localSdpObject.media.length - 1];

			sdpUnifiedPlanUtils.addLegacySimulcast(
				{
					offerMediaObject,
					numStreams : layers.spatialLayers
				});

			offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
		}

		await this._pc.setLocalDescription(offer);

		// We can now get the transceiver.mid.
		const localId = transceiver.mid;

		// Set MID.
		sendingRtpParameters.mid = localId;

		localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
		offerMediaObject = localSdpObject.media[localSdpObject.media.length - 1];

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
			let newEncodings =
				sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });

			Object.assign(newEncodings[0], encodings[0]);

			// Hack for VP9 SVC.
			if (hackVp9Svc)
				newEncodings = [ newEncodings[0] ];

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

	async stopSending({ localId })
	{
		logger.debug('stopSending() [localId:%s]', localId);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated RTCRtpTransceiver not found');

		transceiver.sender.replaceTrack(null);
		this._pc.removeTrack(transceiver.sender);
		this._remoteSdp.disableMediaSection(transceiver.mid);

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
			throw new Error('associated RTCRtpTransceiver not found');

		await transceiver.sender.replaceTrack(track);
	}

	async setMaxSpatialLayer({ localId, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [localId:%s, spatialLayer:%s]',
			localId, spatialLayer);

		const transceiver = this._mapMidTransceiver.get(localId);

		if (!transceiver)
			throw new Error('associated RTCRtpTransceiver not found');

		const parameters = transceiver.sender.getParameters();

		parameters.encodings.forEach((encoding, idx) =>
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
			throw new Error('associated RTCRtpTransceiver not found');

		return transceiver.sender.getStats();
	}

	async sendDataChannel(
		{
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
			priority
		})
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
		// Increase next id.
		this._nextSctpStreamId = ++this._nextSctpStreamId % SCTP_NUM_STREAMS.MIS;

		// If this is the first DataChannel we need to create the SDP answer with
		// m=application section.
		if (!this._hasDataChannelMediaSection)
		{
			const offer = await this._pc.createOffer();
			const localSdpObject = sdpTransform.parse(offer.sdp);
			const offerMediaObject = localSdpObject.media
				.find((m) => m.type === 'application');

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
			.find((m) => String(m.mid) === localId);

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
			.find((t) => t.mid === localId);

		if (!transceiver)
			throw new Error('new RTCRtpTransceiver not found');

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
			throw new Error('associated RTCRtpTransceiver not found');

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
			throw new Error('associated RTCRtpTransceiver not found');

		return transceiver.receiver.getStats();
	}

	async receiveDataChannel({ sctpStreamParameters, label, protocol })
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

class Chrome74
{
	static get name()
	{
		return 'Chrome74';
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
				sdpSemantics       : 'unified-plan'
			});

		try
		{
			pc.addTransceiver('audio');
			pc.addTransceiver('video');

			const offer = await pc.createOffer();

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

	static async getNativeSctpCapabilities()
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
						sctpParameters,
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
						sctpParameters,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints
					});
			}
		}
	}
}

module.exports = Chrome74;
