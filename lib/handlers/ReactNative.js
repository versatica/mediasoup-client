import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as sdpCommonUtils from './sdp/commonUtils';
import * as sdpPlanBUtils from './sdp/planBUtils';
import RemotePlanBSdp from './sdp/RemotePlanBSdp';

//We try to load react-native-webrtc library that should be available if we are using this handler
let webrtc = {};
try {
  webrtc = require('react-native-webrtc');
} catch (err) {}

//We make react-native-webrtc API available from the global object
Object.assign(global, webrtc);

//We will need to override the addTrack method of the MediaStream object
MediaStream.prototype.oldAddTrack = MediaStream.prototype.addTrack;


const logger = new Logger('ReactNative');

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
				iceTransportPolicy : settings.iceTransportPolicy,
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		const self = this;
		//Each time we add a track to a MediaStream, we need to add it to the list
		//of streams accessible by the RTCPeerConnection provided by react-native-webrtc
		MediaStream.prototype.addTrack = function(track) {
			//If the track doesn't come from an existing stream, we use the current
			//stream tag as streamReactTag, or we create one if it doesn't exist yet
			if (!track.streamReactTag) {
				track.streamReactTag = this.reactTag || Date.now();
			}
			//If the current stream doesn't have a react tag, we use the stream tag
			//of the track we are adding. This will make us able to extract a track
			//from a stream.
			if (!this.reactTag) {
				this.reactTag = track.streamReactTag;
				this.id = this.reactTag;
			}
			//We call the original function
			this.oldAddTrack(track);
			//We make sure that the current stream is accessible by the RTCPeerConnection
			self._pc.addStream(this);
		};

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

		// Handled tracks.
		// @type {Set<MediaStreamTrack>}
		this._tracks = new Set();
	}

	addProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'addProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		if (this._tracks.has(track))
			return Promise.reject(new Error('track already added'));

		if (!track.streamReactTag)
			return Promise.reject(new Error('no track.streamReactTag property'));

		let stream;
		let localSdpObj;

		return Promise.resolve()
			.then(() =>
			{
				// Add the track to the Set.
				this._tracks.add(track);

				// Hack: Create a new stream with track.streamReactTag as id.
				stream = new MediaStream(track.streamReactTag);

				// Add the track to the stream.
				stream.addTrack(track);

				// Add the stream to the PeerConnection.
				this._pc.addStream(stream);

				return this._pc.createOffer();
			})
			.then((offer) =>
			{
				// If simulcast is set, mangle the offer.
				if (producer.simulcast)
				{
					logger.debug('addProducer() | enabling simulcast');

					const sdpObject = sdpTransform.parse(offer.sdp);

					sdpPlanBUtils.addSimulcastForTrack(sdpObject, track);

					const offerSdp = sdpTransform.write(sdpObject);

					offer = { type: 'offer', sdp: offerSdp };
				}

				logger.debug(
					'addProducer() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				const offerDesc = new RTCSessionDescription(offer);

				return this._pc.setLocalDescription(offerDesc);
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

				const answerDesc = new RTCSessionDescription(answer);

				return this._pc.setRemoteDescription(answerDesc);
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

				this._tracks.delete(track);
				stream.removeTrack(track);
				this._pc.addStream(stream);

				throw error;
			});
	}

	removeProducer(producer)
	{
		const { track } = producer;

		logger.debug(
			'removeProducer() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		if (!track.streamReactTag)
			return Promise.reject(new Error('no track.streamReactTag property'));

		return Promise.resolve()
			.then(() =>
			{
				// Remove the track from the Set.
				this._tracks.delete(track);

				// Hack: Create a new stream with track.streamReactTag as id.
				const stream = new MediaStream(track.streamReactTag);

				// Add the track to the stream.
				stream.addTrack(track);

				// Add the stream to the PeerConnection.
				this._pc.addStream(stream);

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
				if (this._tracks.size === 0)
				{
					logger.warn(
						'removeProducer() | ignoring expected error due no sending tracks: %s',
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

				const answerDesc = new RTCSessionDescription(answer);

				return this._pc.setRemoteDescription(answerDesc);
			});
	}

	replaceProducerTrack(producer, track)
	{
		logger.debug(
			'replaceProducerTrack() [id:%s, kind:%s, trackId:%s]',
			producer.id, producer.kind, track.id);

		if (!track.streamReactTag)
			return Promise.reject(new Error('no track.streamReactTag property'));

		const oldTrack = producer.track;
		let stream;
		let localSdpObj;

		return Promise.resolve()
			.then(() =>
			{
				// Add the new Track to the Set and remove the old one.
				this._tracks.add(track);
				this._tracks.delete(oldTrack);

				// Hack: Create a new stream with track.streamReactTag as id.
				stream = new MediaStream(track.streamReactTag);

				// Add the track to the stream and remove the old one.
				stream.addTrack(track);
				stream.removeTrack(oldTrack);

				// Add the stream to the PeerConnection.
				this._pc.addStream(stream);

				return this._pc.createOffer();
			})
			.then((offer) =>
			{
				// If simulcast is set, mangle the offer.
				if (producer.simulcast)
				{
					logger.debug('addProducer() | enabling simulcast');

					const sdpObject = sdpTransform.parse(offer.sdp);

					sdpPlanBUtils.addSimulcastForTrack(sdpObject, track);

					const offerSdp = sdpTransform.write(sdpObject);

					offer = { type: 'offer', sdp: offerSdp };
				}

				logger.debug(
					'replaceProducerTrack() | calling pc.setLocalDescription() [offer:%o]',
					offer);

				const offerDesc = new RTCSessionDescription(offer);

				return this._pc.setLocalDescription(offerDesc);
			})
			.then(() =>
			{
				localSdpObj = sdpTransform.parse(this._pc.localDescription.sdp);

				const remoteSdp = this._remoteSdp.createAnswerSdp(localSdpObj);
				const answer = { type: 'answer', sdp: remoteSdp };

				logger.debug(
					'replaceProducerTrack() | calling pc.setRemoteDescription() [answer:%o]',
					answer);

				const answerDesc = new RTCSessionDescription(answer);

				return this._pc.setRemoteDescription(answerDesc);
			})
			.then(() =>
			{
				const rtpParameters = utils.clone(this._rtpParametersByKind[producer.kind]);

				// Fill the RTP parameters for the new track.
				sdpPlanBUtils.fillRtpParametersForTrack(
					rtpParameters, localSdpObj, track);

				// We need to provide new RTP parameters.
				this.safeEmit('@needupdateproducer', producer, rtpParameters);
			})
			.catch((error) =>
			{
				// Panic here. Try to undo things.

				this._tracks.delete(track);
				stream.removeTrack(track);
				this._pc.addStream(stream);

				throw error;
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

				const answerDesc = new RTCSessionDescription(answer);

				return this._pc.setRemoteDescription(answerDesc);
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
			return Promise.reject(new Error('Consumer already added'));

		const encoding = consumer.rtpParameters.encodings[0];
		const cname = consumer.rtpParameters.rtcp.cname;
		const consumerInfo =
		{
			kind     : consumer.kind,
			streamId : `recv-stream-${consumer.id}`,
			trackId  : `consumer-${consumer.kind}-${consumer.id}`,
			ssrc     : encoding.ssrc,
			cname    : cname
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

				const offerDesc = new RTCSessionDescription(offer);

				return this._pc.setRemoteDescription(offerDesc);
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
				const stream = this._pc.getRemoteStreams()
					.find((s) => s.id === consumerInfo.streamId);
				const track = stream.getTrackById(consumerInfo.trackId);

				// Hack: Add a streamReactTag property with the reactTag of the MediaStream
				// generated by react-native-webrtc (this is needed because react-native-webrtc
				// assumes that we're gonna use the streams generated by it).
				track.streamReactTag = stream.reactTag;

				if (!track)
					throw new Error('remote track not found');

				return track;
			});
	}

	removeConsumer(consumer)
	{
		logger.debug(
			'removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

		if (!this._consumerInfos.has(consumer.id))
			return Promise.reject(new Error('Consumer not found'));

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

				const offerDesc = new RTCSessionDescription(offer);

				return this._pc.setRemoteDescription(offerDesc);
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

				const offerDesc = new RTCSessionDescription(offer);

				return this._pc.setRemoteDescription(offerDesc);
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

export default class ReactNative
{
	static get tag()
	{
		return 'ReactNative';
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

		return pc.createOffer(
			{
				offerToReceiveAudio : true,
				offerToReceiveVideo : true
			})
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
