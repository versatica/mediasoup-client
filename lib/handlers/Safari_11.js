'use strict';

import { EventEmitter } from 'events';
import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import * as sdpCommon from './utils/sdpCommon';

const logger = new Logger('Safari_11');

export default class Safari_11 extends EventEmitter
{
	static get name()
	{
		return 'Safari_11';
	}

	constructor()
	{
		super();
		this.setMaxListeners(Infinity);

		logger.debug('constructor()');

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// RTCPeerConnection for sending.
		// @type {RTCPeerConnection}
		this._sendPeerConnection = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'relay',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		// RTCPeerConnection for receiving.
		// @type {RTCPeerConnection}
		this._recvPeerConnection = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'relay',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});
	}

	close()
	{
		logger.debug('close()');

		// Set flag.
		this._closed = true;

		// Close sending RTCPeerConnection.
		try { this._sendPeerConnection.close(); } catch (error) {}

		// Close receiving RTCPeerConnection.
		try { this._recvPeerConnection.close(); } catch (error) {}
	}

	getLocalParameters()
	{
		logger.debug('getLocalParameters()');

		let promises = [];
		const parameters = {};

		// Extract RTCRtpCapabilities and RTCDtlsParameters from the sending
		// RTCPeerConnection.
		this._sendPeerConnection.addTransceiver('audio');
		this._sendPeerConnection.addTransceiver('video');

		promises.push(
			this._sendPeerConnection.createOffer()
				.then((offer) =>
				{
					const sdpObject = sdpTransform.parse(offer.sdp);
					const rtpCapabilities = sdpCommon.extractRtpCapabilities(sdpObject);
					const dtlsParameters = sdpCommon.extractDtlsParameters(sdpObject);

					parameters.rtpCapabilities = rtpCapabilities;
					parameters.sendDtlsParameters = dtlsParameters;
				})
		);

		// Extract RTCDtlsParameters from the receiving RTCPeerConnection.
		const dc = this._recvPeerConnection.createDataChannel('fake');

		promises.push(
			this._recvPeerConnection.createOffer()
				.then((offer) =>
				{
					dc.close();

					const sdpObject = sdpTransform.parse(offer.sdp);
					const dtlsParameters = sdpCommon.extractDtlsParameters(sdpObject);

					parameters.recvDtlsParameters = dtlsParameters;
				})
		);

		return Promise.all(promises)
			.then(() =>
			{
				return parameters;
			});
	}

	setRemoteParameters(remoteParameters)
	{
		logger.debug('setRemoteParameters() [remoteParameters:%o]',
			remoteParameters);

		// TODO

		return Promise.resolve();
	}

	addLocalTrack(track)
	{
		logger.debug('addLocalTrack() [id:%s, kind:%s]', track.id, track.kind);

		try
		{
			// Add the track to the sending PeerConnection.
			this._sendPeerConnection.addTrack(track);
		}
		catch (error)
		{
			return Promise.reject(error);
		}

		// TODO
		return this._sendPeerConnection.createOffer()
			.then((desc) =>
			{
				return this._sendPeerConnection.setLocalDescription(desc);
			});
	}

	removeLocalTrack(track)
	{
		logger.debug('removeLocalTrack() [id:%s, kind:%s]', track.id, track.kind);

		try
		{
			// Get the associated RtpSender.
			const sender = this._sendPeerConnection.getSenders()
				.find((s) => s.track === track);

			if (!sender)
				throw new Error('local track not found');

			// Remove the associated RtpSender.
			this._sendPeerConnection.removeTrack(sender);
		}
		catch (error)
		{
			return Promise.reject(error);
		}

		// TODO
		return this._sendPeerConnection.createOffer()
			.then((desc) =>
			{
				return this._sendPeerConnection.setLocalDescription(desc);
			});
	}
}
