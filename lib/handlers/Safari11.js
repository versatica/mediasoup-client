import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as sdpCommonUtils from './sdp/commonUtils';
import * as sdpPlanBUtils from './sdp/planBUtils';
import RemotePlanBSdp from './sdp/RemotePlanBSdp';

const logger = new Logger('Safari11');

class Handler extends EnhancedEventEmitter
{
	constructor(direction, rtpParametersByKind, settings)
	{
		super(logger);

		// RTCPeerConnection instance.
		// @type {RTCPeerConnection}
		this._pc = new RTCPeerConnection(
			{
				iceServers         : settings.turnServers || [],
				iceTransportPolicy : 'all',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind = rtpParametersByKind;

		// Remote SDP handler.
		// @type {RemotePlanBSdp}
		this._remoteSdp = new RemotePlanBSdp(direction, rtpParametersByKind);

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
}

class SendHandler extends Handler
{
	constructor(rtpParametersByKind, settings)
	{
		super('send', rtpParametersByKind, settings);

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Local stream.
		// @type {MediaStream}
		this._stream = new MediaStream();
	}

	addProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'addProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		if (this._stream.getTrackById(track.id))
			return Promise.reject('track already added');

		let rtpSender;
		let localSdpObj;

		return Promise.resolve()
			.then(() =>
			{
				this._stream.addTrack(track);

				// Add the stream to the PeerConnection.
				rtpSender = this._pc.addTrack(track, this._stream);

				return this._pc.createOffer();
			})
			.then((offer) =>
			{
				logger.debug(
					'addProducer() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				return this._pc.setLocalDescription(offer);
			})
			.then(() =>
			{
				if (!this._transportReady)
					return this._setupTransport();
			})
			.then(() =>
			{
				localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);

				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

				logger.debug(
					'addProducer() | calling pc.setRemoteDescription() [answer:%o]',
					answer);

				return this._pc.setRemoteDescription(answer);
			})
			.then(() =>
			{
				const rtpParameters = utils.clone(this._rtpParametersByKind[producer.kind]);

				// Fill the RTP parameters for this track.
				sdpPlanBUtils.fillRtpParametersForTrack(
					rtpParameters, localSdpObj, track);

				return rtpParameters;
			})
			.catch((error) =>
			{
				// Panic here. Try to undo things.

				try { this._pc.removeTrack(rtpSender); }
				catch (error2) {}

				this._stream.removeTrack(track);

				throw error;
			});
	}

	removeProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'removeProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		return Promise.resolve()
			.then(() =>
			{
				// Get the associated RTCRtpSender.
				const rtpSender = this._pc.getSenders()
					.find((s) => s.track === track);

				if (!rtpSender)
					throw new Error('RTCRtpSender found');

				// Remove the associated RtpSender.
				this._pc.removeTrack(rtpSender);

				// Remove the track from the local stream.
				this._stream.removeTrack(track);

				return this._pc.createOffer();
			})
			.then((offer) =>
			{
				logger.debug(
					'removeProducer() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				return this._pc.setLocalDescription(offer);
			})
			.catch((error) =>
			{
				// NOTE: If there are no sending tracks, setLocalDescription() will fail with
				// "Failed to create channels". If so, ignore it.
				if (this._stream.getTracks().length === 0)
				{
					logger.warn(
						'removeLocalTrack() | ignoring expected error due no sending tracks: %s',
						error.toString());

					return;
				}

				throw error;
			})
			.then(() =>
			{
				if (this._pc.signalingState === 'stable')
					return;

				const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

				logger.debug(
					'removeProducer() | calling pc.setRemoteDescription() [answer:%o]',
					answer);

				return this._pc.setRemoteDescription(answer);
			});
	}

	replaceProducerTrack(producer, track)
	{
		logger.debug(
			'replaceProducerTrack() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		const oldTrack = producer.track;

		return Promise.resolve()
			.then(() =>
			{
				// Get the associated RTCRtpSender.
				const rtpSender = this._pc.getSenders()
					.find((s) => s.track === oldTrack);

				if (!rtpSender)
					throw new Error('local track not found');

				return rtpSender.replaceTrack(track);
			})
			.then(() =>
			{
				// Remove the old track from the local stream.
				this._stream.removeTrack(oldTrack);

				// Add the new track to the local stream.
				this._stream.addTrack(track);
			});
	}

	restartIce(remoteIceParameters)
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateTransportRemoteIceParameters(remoteIceParameters);

		return Promise.resolve()
			.then(() =>
			{
				return this._pc.createOffer({ iceRestart: true });
			})
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

	_setupTransport()
	{
		logger.debug('_setupTransport()');

		return Promise.resolve()
			.then(() =>
			{
				// Get our local DTLS parameters.
				const transportLocalParameters = {};
				const sdp = this._pc.localDescription.sdp;
				const sdpObj = sdpTransform.parse(sdp);
				const dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj);

				// Let's decide that we'll be DTLS server (because we can).
				dtlsParameters.role = 'server';

				transportLocalParameters.dtlsParameters = dtlsParameters;

				// Provide the remote SDP handler with transport local parameters.
				this._remoteSdp.setTransportLocalParameters(transportLocalParameters);

				// We need transport remote parameters.
				return this.safeEmitAsPromise(
					'@needcreatetransport', transportLocalParameters);
			})
			.then((transportRemoteParameters) =>
			{
				// Provide the remote SDP handler with transport remote parameters.
				this._remoteSdp.setTransportRemoteParameters(transportRemoteParameters);

				this._transportReady = true;
			});
	}
}

class RecvHandler extends Handler
{
	constructor(rtpParametersByKind, settings)
	{
		super('recv', rtpParametersByKind, settings);

		// Got transport remote parameters.
		// @type {Boolean}
		this._transportCreated = false;

		// Got transport local parameters.
		// @type {Boolean}
		this._transportUpdated = false;

		// Seen media kinds.
		// @type {Set<String>}
		this._kinds = new Set();

		// Map of Consumers information indexed by consumer.id.
		// - kind {String}
		// - trackId {String}
		// - ssrc {Number}
		// - rtxSsrc {Number}
		// - cname {String}
		// @type {Map<Number, Object>}
		this._consumerInfos = new Map();
	}

	addConsumer(consumer)
	{
		logger.debug(
			'addConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		if (this._consumerInfos.has(consumer.id))
			return Promise.reject('Consumer already added');

		const encoding = consumer.rtpParameters.encodings[0];
		const cname = consumer.rtpParameters.rtcp.cname;
		const consumerInfo =
		{
			kind    : consumer.kind,
			trackId : `consumer-${consumer.kind}-${consumer.id}`,
			ssrc    : encoding.ssrc,
			cname   : cname
		};

		if (encoding.rtx && encoding.rtx.ssrc)
			consumerInfo.rtxSsrc = encoding.rtx.ssrc;

		this._consumerInfos.set(consumer.id, consumerInfo);
		this._kinds.add(consumer.kind);

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportCreated)
					return this._setupTransport();
			})
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._kinds), Array.from(this._consumerInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				logger.debug(
					'addConsumer() | calling pc.setRemoteDescription() [offer:%o]',
					offer);

				return this._pc.setRemoteDescription(offer);
			})
			.then(() =>
			{
				return this._pc.createAnswer();
			})
			.then((answer) =>
			{
				logger.debug(
					'addConsumer() | calling pc.setLocalDescription() [answer:%o]',
					answer);

				return this._pc.setLocalDescription(answer);
			})
			.then(() =>
			{
				if (!this._transportUpdated)
					return this._updateTransport();
			})
			.then(() =>
			{
				const newRtpReceiver = this._pc.getReceivers()
					.find((rtpReceiver) =>
					{
						const { track } = rtpReceiver;

						if (!track)
							return false;

						return track.id === consumerInfo.trackId;
					});

				if (!newRtpReceiver)
					throw new Error('remote track not found');

				return newRtpReceiver.track;
			});
	}

	removeConsumer(consumer)
	{
		logger.debug(
			'removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		if (!this._consumerInfos.has(consumer.id))
			return Promise.reject('Consumer not found');

		this._consumerInfos.delete(consumer.id);

		return Promise.resolve()
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._kinds), Array.from(this._consumerInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				logger.debug(
					'removeConsumer() | calling pc.setRemoteDescription() [offer:%o]',
					offer);

				return this._pc.setRemoteDescription(offer);
			})
			.then(() =>
			{
				return this._pc.createAnswer();
			})
			.then((answer) =>
			{
				logger.debug(
					'removeConsumer() | calling pc.setLocalDescription() [answer:%o]',
					answer);

				return this._pc.setLocalDescription(answer);
			});
	}

	restartIce(remoteIceParameters)
	{
		logger.debug('restartIce()');

		// Provide the remote SDP handler with new remote ICE parameters.
		this._remoteSdp.updateTransportRemoteIceParameters(remoteIceParameters);

		return Promise.resolve()
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._kinds), Array.from(this._consumerInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				logger.debug(
					'restartIce() | calling pc.setRemoteDescription() [offer:%o]',
					offer);

				return this._pc.setRemoteDescription(offer);
			})
			.then(() =>
			{
				return this._pc.createAnswer();
			})
			.then((answer) =>
			{
				logger.debug(
					'restartIce() | calling pc.setLocalDescription() [answer:%o]',
					answer);

				return this._pc.setLocalDescription(answer);
			});
	}

	_setupTransport()
	{
		logger.debug('_setupTransport()');

		return Promise.resolve()
			.then(() =>
			{
				// We need transport remote parameters.
				return this.safeEmitAsPromise('@needcreatetransport', null);
			})
			.then((transportRemoteParameters) =>
			{
				// Provide the remote SDP handler with transport remote parameters.
				this._remoteSdp.setTransportRemoteParameters(transportRemoteParameters);

				this._transportCreated = true;
			});
	}

	_updateTransport()
	{
		logger.debug('_updateTransport()');

		// Get our local DTLS parameters.
		// const transportLocalParameters = {};
		const sdp = this._pc.localDescription.sdp;
		const sdpObj = sdpTransform.parse(sdp);
		const dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj);
		const transportLocalParameters = { dtlsParameters };

		// We need to provide transport local parameters.
		this.safeEmit('@needupdatetransport', transportLocalParameters);

		this._transportUpdated = true;
	}
}

export default class Safari11
{
	static get name()
	{
		return 'Safari11';
	}

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

		pc.addTransceiver('audio');
		pc.addTransceiver('video');

		return pc.createOffer()
			.then((offer) =>
			{
				try { pc.close(); }
				catch (error) {}

				const sdpObj = sdpTransform.parse(offer.sdp);
				const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities(sdpObj);

				return nativeRtpCapabilities;
			})
			.catch((error) =>
			{
				try { pc.close(); }
				catch (error2) {}

				throw error;
			});
	}

	constructor(direction, extendedRtpCapabilities, settings)
	{
		logger.debug(
			'constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		let rtpParametersByKind;

		switch (direction)
		{
			case 'send':
			{
				rtpParametersByKind =
				{
					audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
				};

				return new SendHandler(rtpParametersByKind, settings);
			}
			case 'recv':
			{
				rtpParametersByKind =
				{
					audio : ortc.getReceivingFullRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getReceivingFullRtpParameters('video', extendedRtpCapabilities)
				};

				return new RecvHandler(rtpParametersByKind, settings);
			}
		}
	}
}
