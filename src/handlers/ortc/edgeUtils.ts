import * as utils from '../../utils';
import { RtpCapabilities, RtpParameters } from '../../RtpParameters';

/**
 * Normalize ORTC based Edge's RTCRtpReceiver.getCapabilities() to produce a full
 * compliant ORTC RTCRtpCapabilities.
 */
export function getCapabilities(): RtpCapabilities {
	const nativeCaps = (RTCRtpReceiver as any).getCapabilities();
	const caps = utils.clone<RtpCapabilities>(nativeCaps);

	for (const codec of caps.codecs ?? []) {
		// Rename numChannels to channels.
		// @ts-ignore
		codec.channels = codec.numChannels;
		// @ts-ignore
		delete codec.numChannels;

		// Add mimeType.
		// @ts-ignore (due to codec.name).
		codec.mimeType = codec.mimeType || `${codec.kind}/${codec.name}`;

		// NOTE: Edge sets some numeric parameters as string rather than number. Fix them.
		if (codec.parameters) {
			const parameters = codec.parameters;

			if (parameters.apt) {
				parameters.apt = Number(parameters.apt);
			}

			if (parameters['packetization-mode']) {
				parameters['packetization-mode'] = Number(
					parameters['packetization-mode']
				);
			}
		}

		// Delete emty parameter String in rtcpFeedback.
		for (const feedback of codec.rtcpFeedback || []) {
			if (!feedback.parameter) {
				feedback.parameter = '';
			}
		}
	}

	return caps;
}

/**
 * Generate RTCRtpParameters as ORTC based Edge likes.
 */
export function mangleRtpParameters(
	rtpParameters: RtpParameters
): RtpParameters {
	const params = utils.clone<RtpParameters>(rtpParameters);

	// Rename mid to muxId.
	if (params.mid) {
		// @ts-ignore (due to muxId).
		params.muxId = params.mid;
		delete params.mid;
	}

	for (const codec of params.codecs) {
		// Rename channels to numChannels.
		if (codec.channels) {
			// @ts-ignore.
			codec.numChannels = codec.channels;
			delete codec.channels;
		}

		// Add codec.name (requried by Edge).
		// @ts-ignore (due to name).
		if (codec.mimeType && !codec.name) {
			// @ts-ignore (due to name).
			codec.name = codec.mimeType.split('/')[1];
		}

		// Remove mimeType.
		// @ts-ignore
		delete codec.mimeType;
	}

	return params;
}
