'use strict';

import { EventEmitter } from 'events';
import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import * as sdpUtils from './utils/sdp';

const logger = new Logger('Chrome_55');

/**
 * @ignore
 */
export default class Chrome_55 extends EventEmitter
{
	static get name()
	{
		return 'Chrome_55';
	}

	constructor()
	{
		super();
		this.setMaxListeners(Infinity);

		logger.debug('constructor()');

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Sending stream.
		// @type {MediaStream}
		this._sendStream = new MediaStream();

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
		promises.push(
			this._sendPeerConnection.createOffer(
				{
					offerToReceiveAudio : true,
					offerToReceiveVideo : true
				})
				.then((offer) =>
				{
					const sdpObject = sdpTransform.parse(offer.sdp);
					const rtpCapabilities = sdpUtils.extractRtpCapabilities(sdpObject);
					const dtlsParameters = sdpUtils.extractDtlsParameters(sdpObject);

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
					const dtlsParameters = sdpUtils.extractDtlsParameters(sdpObject);

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
			// Add the track to the local stream.
			this._sendStream.addTrack(track);

			// Add the stream to the sending PeerConnection.
			this._sendPeerConnection.addStream(this._sendStream);
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
			// Remove the track from the local stream.
			this._sendStream.removeTrack(track);

			// Add the stream to the sending PeerConnection.
			this._sendPeerConnection.addStream(this._sendStream);
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
