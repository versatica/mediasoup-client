'use strict';

import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
import * as utils from '../utils';
import * as sdpCommonUtils from './sdp/commonUtils';
import * as sdpUnifiedPlanUtils from './sdp/unifiedPlanUtils';
import RemoteUnifiedPlanSdp from './sdp/RemoteUnifiedPlanSdp';

const logger = new Logger('Firefox50');

class Handler extends EnhancedEventEmitter
{
	constructor(direction, rtpParametersByKind, settings)
	{
		super();

		// RTCPeerConnection instance.
		// @type {RTCPeerConnection}
		this._pc = new RTCPeerConnection(
			{
				iceServers         : settings.turnServers || [],
				iceTransportPolicy : 'relay',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind = rtpParametersByKind;

		// Remote SDP handler.
		// @type {RemoteUnifiedPlanSdp}
		this._remoteSdp = new RemoteUnifiedPlanSdp(direction, rtpParametersByKind);

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
		try { this._pc.close(); } catch (error) {}
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

				return this._pc.setRemoteDescription(answer);
			})
			.then(() =>
			{
				const rtpParameters = utils.clone(this._rtpParametersByKind[producer.kind]);

				// Fill the RTP parameters for this track.
				sdpUnifiedPlanUtils.fillRtpParametersForTrack(
					rtpParameters, localSdpObj, track);

				return rtpParameters;
			})
			.catch((error) =>
			{
				// Panic here. Try to undo things.

				try { this._pc.removeTrack(rtpSender); } catch (error) {}
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
					throw new Error('local track not found');

				// Remove the associated RtpSender.
				this._pc.removeTrack(rtpSender);

				// Remove the track from the local stream.
				this._stream.removeTrack(track);

				// NOTE: If there are no sending tracks, setLocalDescription() will cause
				// Firefox to close DTLS. So for now, let's avoid such a SDP O/A and leave
				// at least a fake-active sending track.
				if (this._stream.getTracks().length === 0)
					return;

				return Promise.resolve()
					.then(() => this._pc.createOffer())
					.then((offer) => this._pc.setLocalDescription(offer));
			})
			.then(() =>
			{
				if (this._pc.signalingState === 'stable')
					return;

				const localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);
				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

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

		// Map of Consumers information indexed by consumer.id.
		// - mid {String}
		// - kind {String}
		// - closed {Boolean}
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
			mid     : `consumer-${consumer.kind}-${consumer.id}`,
			kind    : consumer.kind,
			closed  : consumer.closed,
			trackId : `consumer-${consumer.kind}-${consumer.id}`,
			ssrc    : encoding.ssrc,
			cname   : cname
		};

		if (consumer.rtpSettings.useRtx && encoding.rtx && encoding.rtx.ssrc)
			consumerInfo.rtxSsrc = encoding.rtx.ssrc;

		this._consumerInfos.set(consumer.id, consumerInfo);

		return Promise.resolve()
			.then(() =>
			{
				if (!this._transportCreated)
					return this._setupTransport();
			})
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._consumerInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				return this._pc.setRemoteDescription(offer);
			})
			.then(() =>
			{
				return this._pc.createAnswer();
			})
			.then((answer) =>
			{
				return this._pc.setLocalDescription(answer);
			})
			.then(() =>
			{
				if (!this._transportUpdated)
					return this._updateTransport();
			})
			.then(() =>
			{
				const rtpReceiver = this._pc.getReceivers()
					.find((rtpReceiver) =>
					{
						const { track } = rtpReceiver;

						if (!track)
							return false;

						return track.id === consumerInfo.trackId;
					});

				if (!rtpReceiver)
					throw new Error('remote track not found');

				return rtpReceiver.track;
			});
	}

	removeConsumer(consumer)
	{
		// TODO: If this is the last active Consumer, Firefox will close the DTLS.
		// This is noted in the TODO.md file.

		logger.debug(
			'removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		const consumerInfo = this._consumerInfos.get(consumer.id);

		if (!consumerInfo)
			return Promise.reject('Consumer not found');

		consumerInfo.closed = true;

		return Promise.resolve()
			.then(() =>
			{
				const remoteSdp = this._remoteSdp.createOfferSdp(
					Array.from(this._consumerInfos.values()));
				const offer = { type: 'offer', sdp: remoteSdp };

				return this._pc.setRemoteDescription(offer);
			})
			.then(() =>
			{
				return this._pc.createAnswer();
			})
			.then((answer) =>
			{
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

export default class Firefox50
{
	static get name()
	{
		return 'Firefox50';
	}

	static getLocalRtpCapabilities()
	{
		logger.debug('getLocalRtpCapabilities()');

		const pc = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'relay',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		return pc.createOffer(
			{
				offerToReceiveAudio : true,
				offerToReceiveVideo : true
			})
			.then((offer) =>
			{
				try { pc.close(); } catch (error) {}

				const sdpObj = sdpTransform.parse(offer.sdp);
				const localRtpCapabilities = sdpCommonUtils.extractRtpCapabilities(sdpObj);

				return localRtpCapabilities;
			})
			.catch((error) =>
			{
				try { pc.close(); } catch (error) {}

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
					audio : utils.getSendingRtpParameters('audio', extendedRtpCapabilities),
					video : utils.getSendingRtpParameters('video', extendedRtpCapabilities)
				};

				return new SendHandler(rtpParametersByKind, settings);
			}
			case 'recv':
			{
				rtpParametersByKind =
				{
					audio : utils.getReceivingRtpParameters('audio', extendedRtpCapabilities),
					video : utils.getReceivingRtpParameters('video', extendedRtpCapabilities)
				};

				return new RecvHandler(rtpParametersByKind, settings);
			}
		}
	}
}
