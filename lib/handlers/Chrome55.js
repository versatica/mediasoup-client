'use strict';

import { EventEmitter } from 'events';
import sdpTransform from 'sdp-transform';
import Logger from '../Logger';
import PlanBSdpPair from './utils/PlanBSdpPair';
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

		// Sending stream.
		// @type {MediaStream}
		this._sendStream = new MediaStream();

		// SDP pair for sending.
		this._sendSdpPair = new PlanBSdpPair('send');

		// SDP pair for receiving.
		this._recvSdpPair = new PlanBSdpPair('send');

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

		// TODO: yes?
		// Create a fake datachannel so the PeerConnection will try to connect
		// immediately and won't fail if all the local tracks are removed.
		// this._sendPeerConnection.createDataChannel('fake', { negotiated: true });

		promises.push(
			this._sendPeerConnection.createOffer(
				{
					offerToReceiveAudio : true,
					offerToReceiveVideo : true
				})
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

		// Create a fake datachannel to get DTLS parameters.
		this._recvPeerConnection.createDataChannel('fake', { negotiated: true });

		promises.push(
			this._recvPeerConnection.createOffer()
				.then((offer) =>
				{
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

	setLocalParameters(localParameters)
	{
		logger.debug('setLocalParameters() [localParameters:%o]',
			localParameters);

		// Provide the SDP pair with them.
		this._sendSdpPair.setLocalParameters(localParameters);
	}

	// TODO: Must this return a Promise?
	setRemoteParameters(remoteParameters)
	{
		logger.debug('setRemoteParameters() [remoteParameters:%o]',
			remoteParameters);

		// Provide the SDP pair with them.
		this._sendSdpPair.setRemoteParameters(remoteParameters);
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

		return this._sendPeerConnection.createOffer()
			.then((desc) =>
			{
				return this._sendPeerConnection.setLocalDescription(desc);
			})
			.then(() =>
			{
				const sdp = this._sendPeerConnection.localDescription.sdp;

				this._sendSdpPair.setLocalSdp(sdp);

				const rtpParameters =
					this._sendSdpPair.extractRtpParametersForLocalTrack(track.id, track.kind);

				return rtpParameters;
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
}
