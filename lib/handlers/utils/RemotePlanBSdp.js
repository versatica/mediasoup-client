'use strict';

import sdpTransform from 'sdp-transform';
import Logger from '../../Logger';
import * as sdpCommon from './sdpCommon';

const logger = new Logger('RemotePlanBSdp');

export default class RemotePlanBSdp
{
	constructor(type, remoteRtpCapabilities)
	{
		// This is for a sending RTCPeerConnection.
		// @type {Boolean}
		this._send = false;

		// This is for a receiving RTCPeerConnection.
		// @type {Boolean}
		this._recv = false;

		// Remote RTP capabilities.
		// @type {Object}
		this._remoteRtpCapabilities = remoteRtpCapabilities;

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
		logger.debug('setRemoteParameters()');

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

	// TODO: Must filter those RTP parameters with the remote capabilities and
	// deduce which exact codecs, etc will be sent.
	extractRtpParametersForLocalTrack(localSdp, trackId, kind)
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

		const rtpParameters = sdpCommon.extractRtpParameters(mSection);
		const encoding =
		{
			ssrc : ssrc
		};

		if (rtxSsrc)
			encoding.rtx = { ssrc: rtxSsrc };

		rtpParameters.encodings.push(encoding);

		console.warn('ssrc:%s', ssrc);
		console.warn('rtxSsrc:%s', rtxSsrc);
		console.warn('mSection:%o', mSection);
		console.warn('rtpParameters:%o', rtpParameters);

		return rtpParameters;
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
