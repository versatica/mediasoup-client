const utils = require('../../utils');

/**
 * Normalize Edge's RTCRtpReceiver.getCapabilities() to produce a full
 * compliant ORTC RTCRtpCapabilities.
 *
 * @returns {RTCRtpCapabilities}
 */
exports.getCapabilities = function()
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
		codec.mimeType = codec.mimeType || `${codec.kind}/${codec.name}`;

		// NOTE: Edge sets some numeric parameters as String rather than Number. Fix them.
		if (codec.parameters)
		{
			const parameters = codec.parameters;

			if (parameters.apt)
				parameters.apt = Number(parameters.apt);

			if (parameters['packetization-mode'])
				parameters['packetization-mode'] = Number(parameters['packetization-mode']);
		}

		// Delete emty parameter String in rtcpFeedback.
		for (const feedback of codec.rtcpFeedback || [])
		{
			if (!feedback.parameter)
				delete feedback.parameter;
		}
	}

	return caps;
};

/**
 * Generate RTCRtpParameters as Edge like them.
 *
 * @param  {RTCRtpParameters} rtpParameters
 * @returns {RTCRtpParameters}
 */
exports.mangleRtpParameters = function(rtpParameters)
{
	const params = utils.clone(rtpParameters);

	// Rename mid to muxId.
	if (params.mid)
	{
		params.muxId = params.mid;
		delete params.mid;
	}

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
};
