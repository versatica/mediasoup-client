'use strict';

import sdpTransform from 'sdp-transform';
import Logger from '../../Logger';
import * as ortc from '../../ortc';
import * as sdpCommon from './sdpCommon';

const logger = new Logger('RemotePlanBSdp');

export default class RemotePlanBSdp
{
	constructor(type, extendedRtpCapabilities)
	{
		// This is for a sending RTCPeerConnection.
		// @type {Boolean}
		this._send = false;

		// This is for a receiving RTCPeerConnection.
		// @type {Boolean}
		this._recv = false;

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = extendedRtpCapabilities;

		// Remote parameters, including DTLS parameteres, ICE parameters and ICE
		// candidates.
		// @type {Object}
		this._remoteParameters = null;

		switch (type)
		{
			case 'send':
				this._send = true;
				break;
			case 'recv':
				this._recv = true;
				break;
			default:
				throw TypeError('invalid type');
		}
	}

	setRemoteParameters(remoteParameters)
	{
		logger.debug(
			'setRemoteParameters() [remoteParameters:%o]', remoteParameters);

		this._remoteParameters = remoteParameters;
	}

	getRemoteSdp()
	{
		logger.debug('getRemoteSdp()');

		if (this._send && !this._remoteParameters)
		{
			throw new Error(
				'cannot call getRemoteSdp() with type "send", no remote parameters');
		}

		if (this._send)
			return this._createRemoteSdpForSending();
		else
			return this._createRemoteSdpForReceiving();
	}

	/**
	 * Get encodings for the given MediaStreamTrack.
	 *
	 * NOTE: Currently it just extracts a single encoding (no simulcast).
	 *
	 * @param {String} localSdp - Local SDP containing the track info.
	 * @param {String} trackId - Tid of the track.
	 * @param {String} kind
	 * @return {Array<RTCRtpEncoding>}
	 */
	getEncodingsForTrack(localSdp, trackId, kind)
	{
		const localSdpObject = sdpTransform.parse(localSdp);
		let mSection;
		let ssrc;
		let rtxSsrc;

		mSection = (localSdpObject.media || [])
			.find((m) => m.type === kind);

		if (!mSection)
			throw new Error(`m=${kind} section not found`);

		// Lines a=ssrc:xxxx msid, etc.
		const ssrcLine = (mSection.ssrcs || [])
			.find((line) =>
			{
				return (line.attribute === 'label' && line.value === trackId);
			});

		if (!ssrcLine)
			throw new Error(`a=ssrc line not found for local track [track.id:${trackId}]`);

		ssrc = ssrcLine.id;

		(mSection.ssrcGroups || [])
			.find((line) =>
			{
				if (line.semantics !== 'FID')
					return false;

				const ssrcs = line.ssrcs.split(/[ ]+/);

				if (Number(ssrcs[0]) === ssrc)
				{
					rtxSsrc = Number(ssrcs[1]);
					return true;
				}
			});

		const encoding =
		{
			ssrc : ssrc
		};

		if (rtxSsrc)
			encoding.rtx = { ssrc: rtxSsrc };

		const encodings = [ encoding ];

		return encodings;
	}

	_createRemoteSdpForSending()
	{
		logger.debug('_createRemoteSdpForSending()');

		// TODO
	}

	_createRemoteSdpForReceiving()
	{
		logger.debug('_createRemoteSdpForReceiving()');

		// TODO
	}
}
