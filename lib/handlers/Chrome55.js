'use strict';

import { EventEmitter } from 'events';
import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import RemotePlanBSdp from './utils/RemotePlanBSdp';
import * as sdpCommon from './utils/sdpCommon';

const logger = new Logger('Chrome55');

export default class Chrome55 extends EventEmitter
{
	static get name()
	{
		return 'Chrome55';
	}

	constructor()
	{
		super();
		this.setMaxListeners(Infinity);

		logger.debug('constructor()');

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Can send.
		// @type {Boolean}
		this._sendReady = false;

		// Can receive.
		// @type {Boolean}
		this._recvReady = false;

		// Sending stream.
		// @type {MediaStream}
		this._sendStream = new MediaStream();

		// RTCPeerConnection for sending.
		// @type {RTCPeerConnection}
		this._sendPeerConnection = null;

		// RTCPeerConnection for receiving.
		// @type {RTCPeerConnection}
		this._recvPeerConnection = null;

		// Remote SDP handler for sending.
		// @type {RemotePlanBSdp}
		this._sendRemoteSdp = null;

		// Remote SDP handler for receiving.
		// @type {RemotePlanBSdp}
		this._recvRemoteSdp = null;
	}

	close()
	{
		logger.debug('close()');

		// Set flag.
		this._closed = true;

		// Close sending RTCPeerConnection.
		if (this._sendPeerConnection)
			try { this._sendPeerConnection.close(); } catch (error) {}

		// Close receiving RTCPeerConnection.
		if (this._recvPeerConnection)
			try { this._recvPeerConnection.close(); } catch (error) {}
	}

	getLocalRtpCapabilities()
	{
		logger.debug('getLocalRtpCapabilities()');

		const pc = this._createPeerConnection();

		return pc.createOffer(
			{
				offerToReceiveAudio : true,
				offerToReceiveVideo : true
			})
			.then((offer) =>
			{
				try { pc.close(); } catch (error) {}

				const sdpObject = sdpTransform.parse(offer.sdp);
				const localRtpCapabilities = sdpCommon.extractRtpCapabilities(sdpObject);

				return localRtpCapabilities;
			})
			.catch((error) =>
			{
				try { pc.close(); } catch (error) {}

				throw error;
			});
	}

	setRemoteRtpCapabilities(remoteRtpCapabilities)
	{
		logger.debug(
			'setRemoteRtpCapabilities() [remoteRtpCapabilities:%o]', remoteRtpCapabilities);

		this._sendRemoteSdp = new RemotePlanBSdp('send', remoteRtpCapabilities);
		this._recvRemoteSdp = new RemotePlanBSdp('recv', remoteRtpCapabilities);
	}

	addLocalTrack(track)
	{
		logger.debug('addLocalTrack() [id:%s, kind:%s]', track.id, track.kind);

		return Promise.resolve()
			.then(() =>
			{
				if (!this._sendReady)
					return this._initSend();
			})
			.then(() =>
			{
				// Add the track to the local stream.
				this._sendStream.addTrack(track);

				// Add the stream to the sending PeerConnection.
				this._sendPeerConnection.addStream(this._sendStream);

				return this._sendPeerConnection.createOffer();
			})
			.then((desc) =>
			{
				return this._sendPeerConnection.setLocalDescription(desc);
			})
			.then(() =>
			{
				const sdp = this._sendPeerConnection.localDescription.sdp;
				const rtpParameters =
					this._sendRemoteSdp.extractRtpParametersForLocalTrack(sdp, track.id, track.kind);

				return rtpParameters;
			})
			.catch((error) =>
			{
				throw error;
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
			})
			.catch((error) =>
			{
				// NOTE: If there are no sending tracks, setLocalDescription() will fail with
				// "Failed to create channels". If so, ignore it.
				if (this._sendStream.getTracks().length === 0)
				{
					logger.warn(
						'removeLocalTrack() | ignoring expected error due no sending tracks: %s',
						error.toString());

					return;
				}

				throw error;
			});
	}

	_createPeerConnection()
	{
		const pc = new RTCPeerConnection(
			{
				iceServers         : [],
				iceTransportPolicy : 'relay',
				bundlePolicy       : 'max-bundle',
				rtcpMuxPolicy      : 'require'
			});

		return pc;
	}

	_initSend()
	{
		logger.debug('_initSend()');

		this._sendPeerConnection = this._createPeerConnection();
		this._sendRemoteSdp = new RemotePlanBSdp('send');

		let localDtlsParameters;

		return this._sendPeerConnection.createOffer({ offerToReceiveAudio: true })
			.then((offer) =>
			{
				const sdpObject = sdpTransform.parse(offer.sdp);

				// Get our local DTLS parameters.
				localDtlsParameters = sdpCommon.extractDtlsParameters(sdpObject);

				// Let's decide that we'll be DTLS server (because we can).
				localDtlsParameters.role = 'server';
			})
			.then(() =>
			{
				// We need a transport.
				return new Promise((resolve, reject) =>
				{
					const callback = (response) =>
					{
						const remoteDtlsParameters = response.dtlsParameters;

						// TODO: Handle ICE parameters and ICE candidates.

						resolve(remoteDtlsParameters);
					};

					const errback = (error) =>
					{
						reject(error);
					};

					this.emit('needtransport', localDtlsParameters, callback, errback);
				});
			})
			.then((remoteDtlsParameters) =>
			{
				// TODO: TMP
				console.warn('_initSend() | got remote DTLS: %o', remoteDtlsParameters);

				this._sendRemoteSdp.setRemoteDtlsParameters(remoteDtlsParameters);
				this._sendReady = true;
			})
			.catch((error) =>
			{
				try { this._sendPeerConnection.close(); } catch (error2) {}
				this._sendPeerConnection = null;
				this._sendRemoteSdp = null;

				throw error;
			});
	}
}
