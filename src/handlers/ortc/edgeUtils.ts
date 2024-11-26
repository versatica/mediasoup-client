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
		// @ts-expect-error --- On purpose.
		codec.channels = codec.numChannels;
		// @ts-expect-error --- On purpose.
		delete codec.numChannels;

		// Add mimeType.
		// @ts-expect-error --- On purpose (due to codec.name).
		codec.mimeType = codec.mimeType ?? `${codec.kind}/${codec.name}`;

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
		for (const feedback of codec.rtcpFeedback ?? []) {
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
		// @ts-expect-error --- On purpose (due to muxId).
		params.muxId = params.mid;
		delete params.mid;
	}

	for (const codec of params.codecs) {
		// Rename channels to numChannels.
		if (codec.channels) {
			// @ts-expect-error --- On purpose.
			codec.numChannels = codec.channels;
			delete codec.channels;
		}

		// Add codec.name (requried by Edge).
		// @ts-expect-error --- On purpose (due to name).
		if (codec.mimeType && !codec.name) {
			// @ts-expect-error --- On purpose (due to name).
			codec.name = codec.mimeType.split('/')[1];
		}

		// Remove mimeType.
		// @ts-expect-error --- On purpose.
		delete codec.mimeType;
	}

	return params;
}
