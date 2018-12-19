const sdpTransform = require('sdp-transform');
const Logger = require('../Logger');
const EnhancedEventEmitter = require('../EnhancedEventEmitter');
const { UnsupportedError, DuplicatedError } = require('../errors');
const utils = require('../utils');
const ortc = require('../ortc');
const sdpCommonUtils = require('./sdp/commonUtils');
const sdpUnifiedPlanUtils = require('./sdp/unifiedPlanUtils');
const RemoteUnifiedPlanSdp = require('./sdp/RemoteUnifiedPlanSdp');

const logger = new Logger('Firefox59');

class Handler extends EnhancedEventEmitter
{
	constructor(
		{
			transportRemoteParameters,
			direction,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			rtpParametersByKind
		}
	)
	{
		super(logger);

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind = rtpParametersByKind;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Remote SDP handler.
		// @type {RemoteUnifiedPlanSdp}
		this._remoteSdp = new RemoteUnifiedPlanSdp(direction, rtpParametersByKind);

		this._remoteSdp.setTransportRemoteParameters(transportRemoteParameters);

		// RTCPeerConnection instance.
		// @type {RTCPeerConnection}
		this._pc = new RTCPeerConnection(
			{
				iceServers         : iceServers || [],
				iceTransportPolicy : iceTransportPolicy || 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
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

	updateIceServers({ iceServers }) // eslint-disable-line no-unused-vars
	{
		logger.debug('updateIceServers()');

		// NOTE: Firefox 59 does not implement pc.setConfiguration().

		return Promise.reject(new UnsupportedError('not supported'));
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

		// Local stream.
		// @type {MediaStream}
		this._stream = new MediaStream();

		// RID value counter for simulcast (so they never match).
		// @type {Number}
		this._nextRid = 1;
	}

	send({ track, simulcast })
	{
		logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);

		if (this._stream.getTrackById(track.id))
			return Promise.reject(new DuplicatedError('track already added'));

		let rtpSender;
		let localSdpObj;

		return Promise.resolve()
			.then(() =>
			{
				// Add the stream to the PeerConnection.
				rtpSender = this._pc.addTrack(track, this._stream);
			})
			.then(() =>
			{
				const encodings = [];

				if (simulcast)
				{
					logger.debug('send() | enabling simulcast');

					if (simulcast.low)
					{
						encodings.push(
							{
								rid        : `low${this._nextRid}`,
								active     : true,
								priority   : 'high',
								maxBitrate : simulcast.low
							});
					}

					if (simulcast.medium)
					{
						encodings.push(
							{
								rid        : `medium${this._nextRid}`,
								active     : true,
								priority   : 'medium',
								maxBitrate : simulcast.medium
							});
					}

					if (simulcast.high)
					{
						encodings.push(
							{
								rid        : `high${this._nextRid}`,
								active     : true,
								priority   : 'low',
								maxBitrate : simulcast.high
							});
					}

					// Update RID counter for future ones.
					this._nextRid++;
				}

				const parameters = rtpSender.getParameters();
				const newParameters = Object.assign(parameters, { encodings });

				return rtpSender.setParameters(newParameters);
			})
			.then(() => this._pc.createOffer())
			.then((offer) =>
			{
				logger.debug(
					'send() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				return this._pc.setLocalDescription(offer);
			})
			.then(() =>
			{
				// In Firefox use DTLS role client even if we are the "offerer" since
				// Firefox does not respect ICE-Lite.
				if (!this._transportReady)
					return this._setupTransport({ localDtlsRole: 'client' });
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
				// Add the track to the local stream.
				this._stream.addTrack(track);

				const rtpParameters =
					utils.clone(this._rtpParametersByKind[track.kind]);

				// Fill the RTP parameters for this track.
				sdpUnifiedPlanUtils.fillRtpParametersForTrack(
					rtpParameters, localSdpObj, track);

				return rtpParameters;
			})
			.catch((error) =>
			{
				// Panic here. Try to undo things.

				try { this._pc.removeTrack(rtpSender); }
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

				// Remove the associated RtpSender.
				this._pc.removeTrack(rtpSender);

				// Remove the track from the local stream.
				this._stream.removeTrack(track);

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

				return this._pc.setRemoteDescription(answer);
			});
	}

	replaceTrack({ track, newTrack })
	{
		logger.debug('replaceTrack() [newTrack.id:%s]', newTrack.id);

		if (this._stream.getTrackById(newTrack.id))
			return Promise.reject(new DuplicatedError('track already added'));

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
				// Remove the old track from the local stream.
				this._stream.removeTrack(track);

				// Add the new track to the local stream.
				this._stream.addTrack(newTrack);
			});
	}

	setMaxSpatialLayer({ track, spatialLayer })
	{
		logger.debug(
			'setMaxSpatialLayer() [track.id:%s, spatialLayer:%s]',
			track.id, spatialLayer);

		return Promise.reject(new UnsupportedError('not supported'));
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
		// - ssrc {Number}
		// - rtxSsrc {Number}
		// - cname {String}
		// @type {Map<String, Object>}
		this._receiverInfos = new Map();
	}

	receive({ id, kind, rtpParameters })
	{
		logger.debug('receive() [id:%s, kind:%s]', id, kind);

		if (this._receiverInfos.has(id))
			return Promise.reject(new DuplicatedError('already receiving this source'));

		const encoding = rtpParameters.encodings[0];
		const cname = rtpParameters.rtcp.cname;
		const receiverInfo =
		{
			mid      : `${kind[0]}-${id}`,
			kind     : kind,
			closed   : false,
			streamId : id,
			trackId  : `${kind}-${id}`,
			ssrc     : encoding.ssrc,
			cname    : cname
		};

		if (encoding.rtx && encoding.rtx.ssrc)
			receiverInfo.rtxSsrc = encoding.rtx.ssrc;

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

class Firefox59
{
	static getNativeRtpCapabilities()
	{
		logger.debug('getNativeRtpCapabilities()');

		const pc = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		pc.addTransceiver('audio', { direction: 'sendrecv' });

		// NOTE: We need to add a real video track to get the RID extension mapping.
		const canvas = document.createElement('canvas');

		// NOTE: Otherwise Firefox fails in next line.
		canvas.getContext('2d');

		const fakeStream = canvas.captureStream();
		const fakeVideoTrack = fakeStream.getVideoTracks()[0];
		const videoTransceiver =
			pc.addTransceiver(fakeVideoTrack, { direction: 'sendrecv' });
		const parameters = videoTransceiver.sender.getParameters();
		const encodings =
		[
			{ rid: 'RID1', maxBitrate: 40000 },
			{ rid: 'RID2', maxBitrate: 10000 }
		];
		const newParameters = Object.assign(parameters, { encodings });

		videoTransceiver.sender.setParameters(newParameters);

		return pc.createOffer()
			.then((offer) =>
			{
				try { canvas.remove(); }
				catch (error) {}

				try { fakeVideoTrack.stop(); }
				catch (error) {}

				try { pc.close(); }
				catch (error) {}

				const sdpObj = sdpTransform.parse(offer.sdp);
				const nativeRtpCapabilities =
					sdpCommonUtils.extractRtpCapabilities(sdpObj);

				return nativeRtpCapabilities;
			})
			.catch((error) =>
			{
				try { canvas.remove(); }
				catch (error2) {}

				try { fakeVideoTrack.stop(); }
				catch (error2) {}

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
				const rtpParametersByKind =
				{
					audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
				};

				return new SendHandler(
					{
						transportRemoteParameters,
						direction,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints,
						rtpParametersByKind
					});
			}
			case 'recv':
			{
				const rtpParametersByKind =
				{
					audio : ortc.getReceivingFullRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getReceivingFullRtpParameters('video', extendedRtpCapabilities)
				};

				return new RecvHandler(
					{
						transportRemoteParameters,
						direction,
						iceServers,
						iceTransportPolicy,
						proprietaryConstraints,
						rtpParametersByKind
					});
			}
		}
	}
}

module.exports = Firefox59;
