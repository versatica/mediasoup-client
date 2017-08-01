'use strict';

import { EventEmitter } from 'events';
import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import * as utils from '../utils';
import * as ortc from '../ortc';
import * as sdpCommonUtils from './sdp/commonUtils';
import * as sdpPlanBUtils from './sdp/planBUtils';
import RemotePlanBSdp from './sdp/RemotePlanBSdp';

const logger = new Logger('Safari11');

class SendHandler extends EventEmitter
{
	constructor(extendedRtpCapabilities, settings)
	{
		super();
		this.setMaxListeners(Infinity);

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// ICE/DTLS negotiated. Can send or receive media.
		// @type {Boolean}
		this._ready = false;

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = extendedRtpCapabilities;

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
		this._rtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		// Remote SDP handler.
		// @type {RemotePlanBSdp}
		this._remoteSdp = new RemotePlanBSdp('send', this._rtpParametersByKind);
	}

	close()
	{
		logger.debug('close()');

		// Set flag.
		this._closed = true;

		// Close RTCPeerConnection.
		try { this._pc.close(); } catch (error) {}
	}

	addLocalTrack(track)
	{
		logger.debug('addLocalTrack() [id:%s, kind:%s]', track.id, track.kind);

		let localSdpObj;

		return Promise.resolve()
			.then(() =>
			{
				if (!this._ready)
					return this._setup();
			})
			.then(() =>
			{
				// Add the stream to the PeerConnection.
				this._pc.addTrack(track);

				return this._pc.createOffer();
			})
			.then((desc) =>
			{
				return this._pc.setLocalDescription(desc);
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
				const rtpParameters = utils.clone(this._rtpParametersByKind[track.kind]);

				// Fill the RTP parameters for this track.
				sdpPlanBUtils.fillRtpParametersForTrack(
					rtpParameters, localSdpObj, track);

				return rtpParameters;
			});
	}

	removeLocalTrack(track)
	{
		logger.debug('removeLocalTrack() [id:%s, kind:%s]', track.id, track.kind);

		return Promise.resolve()
			.then(() =>
			{
				// Get the associated RTCRtpSender.
				const rtpSender = this._pc.getSenders()
					.find((s) => s.track === track);

				if (!rtpSender)
					throw new Error('local track not found');

				// Remove the associated RtpSender.
				this._sendPeerConnection.removeTrack(rtpSender);

				return this._pc.createOffer();
			})
			.then((desc) =>
			{
				return this._pc.setLocalDescription(desc);
			})
			.catch((error) =>
			{
				// TODO: Check if there are zero sender so don't complain?

				throw error;
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

	_setup()
	{
		logger.debug('_setup()');

		const localParameters = {};

		this._pc.addTransceiver('audio');

		return this._pc.createOffer()
			.then((offer) =>
			{
				// Get our local DTLS parameters.
				const sdpObj = sdpTransform.parse(offer.sdp);
				const dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj);

				// Let's decide that we'll be DTLS server (because we can).
				dtlsParameters.role = 'server';

				localParameters.dtlsParameters = dtlsParameters;

				// Provide the remote SDP handler with transport local parameters.
				this._remoteSdp.setLocalParameters(localParameters);
			})
			.then(() =>
			{
				// We need a transport.
				return new Promise((resolve, reject) =>
				{
					const callback = (response) =>
					{
						const remoteParameters = response;

						resolve(remoteParameters);
					};

					const errback = (error) =>
					{
						reject(error);
					};

					this.emit('needtransport', localParameters, callback, errback);
				});
			})
			.then((remoteParameters) =>
			{
				// Provide the remote SDP handler with transport remote parameters.
				this._remoteSdp.setRemoteParameters(remoteParameters);

				// We are ready to add local tracks.
				this._ready = true;
			});
	}
}

export default class Safari11
{
	static get name()
	{
		return 'Safari11';
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

		pc.addTransceiver('audio');
		pc.addTransceiver('video');

		return pc.createOffer()
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

		switch (direction)
		{
			case 'send':
				return new SendHandler(extendedRtpCapabilities, settings);
			case 'recv':
				// TODO:
				break;
		}
	}
}
