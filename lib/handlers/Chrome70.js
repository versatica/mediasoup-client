const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { DuplicatedError } = require('../errors');
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
			transportRemoteParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			sendingRtpParametersByKind
		}
	)
	{
		super(logger);

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._sendingRtpParametersByKind = sendingRtpParametersByKind;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Remote SDP handler.
		// @type {RemoteUnifiedPlanSdp}
		this._remoteSdp = new RemoteUnifiedPlanSdp(
			{
				transportRemoteParameters,
				sendingRtpParametersByKind
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

	getTransportStats()
	{
		return this._pc.getStats();
	}

	updateIceServers({ iceServers })
	{
		logger.debug('updateIceServers()');

		return Promise.resolve()
			.then(() =>
			{
				const configuration = this._pc.getConfiguration();

				configuration.iceServers = iceServers;

				this._pc.setConfiguration(configuration);
			});
	}

	_setupTransport({ localDtlsRole } = {})
	{
		return Promise.resolve()
			.then(() =>
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
				return this.safeEmitAsPromise('@connect', transportLocalParameters);
			})
			.then(() =>
			{
				this._transportReady = true;
			});
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

	send({ track, simulcast })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (this._tracks.has(track))
			return Promise.reject(new DuplicatedError('track already handled'));

		let transceiver;
		let localSdpObj;

		return Promise.resolve()
			.then(() =>
			{
				// Let's check if there is any inactive transceiver for same kind and
				// reuse it if so.
				transceiver = this._pc.getTransceivers()
					.find((t) => (
						t.receiver.track.kind === track.kind &&
						t.direction === 'inactive'
					));

				if (transceiver)
				{
					logger.debug('send() | reusing an inactive transceiver');

					transceiver.direction = 'sendonly';

					const rtpSender = transceiver.sender;

					// Must reset disabled encodings in the RtpSender and enable all.
					const parameters = rtpSender.getParameters();

					for (const encoding of parameters.encodings)
					{
						encoding.active = true;
					}

					return rtpSender.setParameters(parameters)
						.then(() => rtpSender.replaceTrack(track));
				}
				else
				{
					transceiver = this._pc.addTransceiver(track, { direction: 'sendonly' });
				}
			})
			.then(() => this._pc.createOffer())
			.then((offer) =>
			{
				// If simulcast is set, mangle the offer.
				if (simulcast)
				{
					logger.debug('send() | enabling simulcast');

					const sdpObject = sdpTransform.parse(offer.sdp);

					sdpUnifiedPlanUtils.addPlanBSimulcast(
						sdpObject,
						track,
						{
							numStreams : Object.keys(simulcast).length,
							mid        : transceiver.mid
						});

					const offerSdp = sdpTransform.write(sdpObject);

					offer = { type: 'offer', sdp: offerSdp };
				}

				logger.debug(
					'send() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				return this._pc.setLocalDescription(offer);
			})
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'server' });
			})
			.then(() =>
			{
				localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);

				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

				logger.debug(
					'send() | calling pc.setRemoteDescription() [answer:%o]',
					answer);

				return this._pc.setRemoteDescription(answer);
			})
			.then(() =>
			{
				const rtpParameters =
					utils.clone(this._sendingRtpParametersByKind[track.kind]);

				sdpUnifiedPlanUtils.fillRtpParametersForTrack(
					rtpParameters,
					localSdpObj,
					track,
					{ mid: transceiver.mid, planBSimulcast: true });

				this._tracks.add(track);

				return rtpParameters;
			})
			.catch((error) =>
			{
				// Panic here. Try to undo things.

				try { transceiver.direction = 'inactive'; }
				catch (error2) {}

				throw error;
			});
	}

	stopSending({ track })
	{
		logger.debug('stopSending() [track.id:%s]', track.id);

		return Promise.resolve()
			.then(() =>
			{
				// Get the associated RTCRtpSender.
				const rtpSender = this._pc.getSenders()
					.find((s) => s.track === track);

				if (!rtpSender)
					throw new Error('local track not found');

				this._pc.removeTrack(rtpSender);

				return this._pc.createOffer();
			})
			.then((offer) =>
			{
				logger.debug(
					'stopSending() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				return this._pc.setLocalDescription(offer);
			})
			.then(() =>
			{
				const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

				logger.debug(
					'stopSending() | calling pc.setRemoteDescription() [answer:%o]',
					answer);

				this._tracks.delete(track);

				return this._pc.setRemoteDescription(answer);
			});
	}

	replaceTrack({ track, newTrack })
	{
		logger.debug('replaceTrack() [newTrack.id:%s]', newTrack.id);

		if (this._tracks.has(newTrack))
			return Promise.reject(new DuplicatedError('track already handled'));

		return Promise.resolve()
			.then(() =>
			{
				// Get the associated RTCRtpSender.
				const rtpSender = this._pc.getSenders()
					.find((s) => s.track === track);

				if (!rtpSender)
					throw new Error('local track not found');

				return rtpSender.replaceTrack(newTrack);
			})
			.then(() =>
			{
				this._tracks.delete(track);
				this._tracks.add(newTrack);
			});
	}

	setMaxSpatialLayer({ track, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			return Promise.reject(new Error('local track not found'));

		const parameters = rtpSender.getParameters();
		const lowEncoding = parameters.encodings[0];
		const mediumEncoding = parameters.encodings[1];
		const highEncoding = parameters.encodings[2];

		switch (spatialLayer)
		{
			case 'low':
			{
				lowEncoding && (lowEncoding.active = true);
				mediumEncoding && (mediumEncoding.active = false);
				highEncoding && (highEncoding.active = false);

				break;
			}

			case 'medium':
			{
				lowEncoding && (lowEncoding.active = true);
				mediumEncoding && (mediumEncoding.active = true);
				highEncoding && (highEncoding.active = false);

				break;
			}

			case 'high':
			{
				lowEncoding && (lowEncoding.active = true);
				mediumEncoding && (mediumEncoding.active = true);
				highEncoding && (highEncoding.active = true);

				break;
			}
		}

		return rtpSender.setParameters(parameters);
	}

	getSenderStats({ track })
	{
		// Get the associated RTCRtpSender.
		const rtpSender = this._pc.getSenders()
			.find((s) => s.track === track);

		if (!rtpSender)
			return Promise.reject(new Error('local track not found'));

		return rtpSender.getStats();
	}

	restartIce({ remoteIceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp
			.updateTransportRemoteIceParameters(remoteIceParameters);

		if (!this._transportReady)
			return Promise.resolve();

		return Promise.resolve()
			.then(() => this._pc.createOffer({ iceRestart: true }))
			.then((offer) =>
			{
				logger.debug(
					'restartIce() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				return this._pc.setLocalDescription(offer);
			})
			.then(() =>
			{
				const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

				logger.debug(
					'restartIce() | calling pc.setRemoteDescription() [answer:%o]',
					answer);

				return this._pc.setRemoteDescription(answer);
			});
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
	}

	receive({ id, kind, rtpParameters })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._receiverInfos.has(id))
			return Promise.reject(new DuplicatedError('already receiving this source'));

		const receiverInfo =
		{
			mid           : `${kind[0]}-${id}`,
			kind          : kind,
			closed        : false,
			streamId      : id,
			trackId       : `${kind}-${id}`,
			rtpParameters : rtpParameters
		};

		this._receiverInfos.set(id, receiverInfo);

		return Promise.resolve()
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._receiverInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				logger.debug(
					'receive() | calling pc.setRemoteDescription() [offer:%o]',
					offer);

				return this._pc.setRemoteDescription(offer);
			})
			.catch((error) =>
			{
				// Panic here. Try to undo things.

				this._receiverInfos.delete(id);

				throw error;
			})
			.then(() => this._pc.createAnswer())
			.then((answer) =>
			{
				logger.debug(
					'receive() | calling pc.setLocalDescription() [answer:%o]',
					answer);

				return this._pc.setLocalDescription(answer);
			})
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'client' });
			})
			.then(() =>
			{
				const transceiver = this._pc.getTransceivers()
					.find((t) => t.mid === receiverInfo.mid);

				if (!transceiver)
					throw new Error('remote track not found');

				return transceiver.receiver.track;
			});
	}

	stopReceiving({ id })
	{
		logger.debug('stopReceiving() [id:%s]', id);

		const receiverInfo = this._receiverInfos.get(id);

		if (!receiverInfo)
			return Promise.reject(new Error('receiver not found'));

		receiverInfo.closed = true;

		return Promise.resolve()
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._receiverInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				logger.debug(
					'stopReceiving() | calling pc.setRemoteDescription() [offer:%o]',
					offer);

				return this._pc.setRemoteDescription(offer);
			})
			.then(() => this._pc.createAnswer())
			.then((answer) =>
			{
				logger.debug(
					'stopReceiving() | calling pc.setLocalDescription() [answer:%o]',
					answer);

				return this._pc.setLocalDescription(answer);
			});
	}

	getReceiverStats({ id })
	{
		const receiverInfo = this._receiverInfos.get(id);

		if (!receiverInfo)
			return Promise.reject(new Error('receiver not found'));

		const { mid } = receiverInfo;

		// Get the associated RTCRtpTransceiver.
		const transceiver = this._pc.getTransceivers()
			.find((t) => t.mid === mid);

		if (!transceiver)
			return Promise.reject(new Error('transceiver not found'));

		return transceiver.receiver.getStats();
	}

	restartIce({ remoteIceParameters })
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp
			.updateTransportRemoteIceParameters(remoteIceParameters);

		if (!this._transportReady)
			return Promise.resolve();

		return Promise.resolve()
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._receiverInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				logger.debug(
					'restartIce() | calling pc.setRemoteDescription() [offer:%o]',
					offer);

				return this._pc.setRemoteDescription(offer);
			})
			.then(() => this._pc.createAnswer())
			.then((answer) =>
			{
				logger.debug(
					'restartIce() | calling pc.setLocalDescription() [answer:%o]',
					answer);

				return this._pc.setLocalDescription(answer);
			});
	}
}

class Chrome70
{
	static getNativeRtpCapabilities()
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

		pc.addTransceiver('audio');
		pc.addTransceiver('video');

		return pc.createOffer()
			.then((offer) =>
			{
				try { pc.close(); }
				catch (error) {}

				const sdpObj = sdpTransform.parse(offer.sdp);
				const nativeRtpCapabilities =
					sdpCommonUtils.extractRtpCapabilities(sdpObj);

				return nativeRtpCapabilities;
			})
			.catch((error) =>
			{
				try { pc.close(); }
				catch (error2) {}

				throw error;
			});
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
				return new RecvHandler(
					{
						transportRemoteParameters,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints
					});
			}
		}
	}
}

module.exports = Chrome70;
