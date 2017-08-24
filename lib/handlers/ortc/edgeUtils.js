/* global RTCRtpReceiver */

import * as utils from '../../utils';

/**
 * Normalize Edge's RTCRtpReceiver.getCapabilities() to produce a full
 * compliant ORTC RTCRtpCapabilities.
 *
 * @return {RTCRtpCapabilities}
 */
export function getCapabilities()
{
	const nativeCaps = RTCRtpReceiver.getCapabilities();
	const caps = utils.clone(nativeCaps);

	for (const codec of caps.codecs)
	{
		// Rename numChannels to channels.
		codec.channels = codec.numChannels;
		delete codec.numChannels;

		// Normalize channels.
		if (codec.kind !== 'audio')
			delete codec.channels;
		else if (!codec.channels)
			codec.channels = 1;

		// Add mimeType.
		codec.mimeType = `${codec.kind}/${codec.name}`;

		// NOTE: Edge sets parameters.apt as String rather than Number. Fix it.
		if (codec.name === 'rtx')
			codec.parameters.apt = Number(codec.parameters.apt);

		// Delete emty parameter String in rtcpFeedback.
		for (const feedback of codec.rtcpFeedback || [])
		{
			if (!feedback.parameter)
				delete feedback.parameter;
		}
	}

	return caps;
}

/**
 * Generate RTCRtpParameters as Edge like them.
 *
 * @param  {RTCRtpParameters} rtpParameters
 * @return {RTCRtpParameters}
 */
export function mangleRtpParameters(rtpParameters)
{
	const params = utils.clone(rtpParameters);

	for (const codec of params.codecs)
	{
		// Rename channels to numChannels.
		if (codec.channels)
		{
			codec.numChannels = codec.channels;
			delete codec.channels;
		}

		// Remove mimeType.
		delete codec.mimeType;
	}

	return params;
}
