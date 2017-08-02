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

class Handler extends EventEmitter
{
	constructor(direction, rtpParametersByKind, settings)
	{
		super();
		this.setMaxListeners(Infinity);

		// ICE/DTLS negotiated. Can send or receive media.
		// @type {Boolean}
		this._ready = false;

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
		// @type {RemotePlanBSdp}
		this._remoteSdp = new RemotePlanBSdp(direction, rtpParametersByKind);

		// Handle RTCPeerConnection connection status.
		this._pc.addEventListener('iceconnectionstatechange', () =>
		{
			switch (this._pc.iceConnectionState)
			{
				case 'checking':
					this.emit('connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('connectionstatechange', 'closed');
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

		// Container to hold sending tracks.
		// @type {Set<MediaStreamTrack>}
		this._tracks = new Set();
	}

	addLocalTrack(track)
	{
		logger.debug('addLocalTrack() [id:%s, kind:%s]', track.id, track.kind);

		let localSdpObj;

		return Promise.resolve()
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
				if (!this._ready)
					return this._setup();
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

				// Add the track to the Set.
				this._tracks.add(track);

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
				this._pc.removeTrack(rtpSender);

				// Remove the track from the Set.
				this._tracks.delete(track);

				return this._pc.createOffer();
			})
			.then((desc) =>
			{
				return this._pc.setLocalDescription(desc);
			})
			.catch((error) =>
			{
				// NOTE: If there are no sending tracks, setLocalDescription() will fail with
				// "Failed to create channels". If so, ignore it.
				if (this._tracks.size === 0)
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

				return this._pc.setRemoteDescription(answer);
			});
	}

	_setup()
	{
		logger.debug('_setup()');

		const localParameters = {};

		return Promise.resolve()
			.then(() =>
			{
				// Get our local DTLS parameters.
				const sdp = this._pc.localDescription.sdp;
				const sdpObj = sdpTransform.parse(sdp);
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
					audio : ortc.getReceivingRtpParameters('audio', extendedRtpCapabilities),
					video : ortc.getReceivingRtpParameters('video', extendedRtpCapabilities)
				};

				// TODO
				// return new RecvHandler(rtpParametersByKind, settings);
				return;
			}
		}
	}
}
