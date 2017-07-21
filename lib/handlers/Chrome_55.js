'use strict';

import { EventEmitter } from 'events';
import Logger from '../Logger';

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
		if (this._closed)
			return;

		logger.debug('close()');

		// Set flag.
		this._closed = true;

		// Close sending RTCPeerConnection.
		try { this._sendPeerConnection.close(); } catch (error) {}

		// Close receiving RTCPeerConnection.
		try { this._recvPeerConnection.close(); } catch (error) {}
	}

	addTrack(track)
	{
		logger.debug('addTrack() [id:%s, kind:%s]', track.id, track.kind);

		// Add the track to the local stream.
		this._sendStream.addTrack(track);

		// Notify the sending PeerConnection using the legacy API.
		this._sendPeerConnection.addStream(this._sendStream);

		// TODO: pc.createOffer, etc
		return this._sendPeerConnection.createOffer()
			.then((desc) =>
			{
				return this._sendPeerConnection.setLocalDescription(desc);
			});
	}

	removeTrack(track)
	{
		logger.debug('removeTrack() [id:%s, kind:%s]', track.id, track.kind);

		// Remove the track from the local stream.
		this._sendStream.removeTrack(track);

		// Notify the sending PeerConnection using the legacy API.
		this._sendPeerConnection.addStream(this._sendStream);

		// TODO: pc.createOffer, etc
		return this._sendPeerConnection.createOffer()
			.then((desc) =>
			{
				return this._sendPeerConnection.setLocalDescription(desc);
			});
	}
}
