import type {
	RtpCapabilities,
	MediaKind,
	RtpHeaderExtensionUri,
	RtpHeaderExtensionDirection,
} from '../../RtpParameters';

/**
 * This function adds RTCP NACK support for OPUS codec in given capabilities.
 */
export function addNackSupportForOpus(rtpCapabilities: RtpCapabilities): void {
	for (const codec of rtpCapabilities.codecs ?? []) {
		if (
			(codec.mimeType.toLowerCase() === 'audio/opus' ||
				codec.mimeType.toLowerCase() === 'audio/multiopus') &&
			!codec.rtcpFeedback?.some(fb => fb.type === 'nack' && !fb.parameter)
		) {
			if (!codec.rtcpFeedback) {
				codec.rtcpFeedback = [];
			}

			codec.rtcpFeedback.push({ type: 'nack' });
		}
	}
}

/**
 * This function adds the given RTP header extension to given capabilities.
 */
export function addHeaderExtensionSupport(
	rtpCapabilities: RtpCapabilities,
	headerExtension: {
		uri: RtpHeaderExtensionUri;
		kind: MediaKind;
		direction: RtpHeaderExtensionDirection;
	}
): void {
	if (
		rtpCapabilities.headerExtensions?.some(
			exten =>
				exten.kind === headerExtension.kind && exten.uri === headerExtension.uri
		)
	) {
		return;
	}

	if (!rtpCapabilities.headerExtensions) {
		rtpCapabilities.headerExtensions = [];
	}

	const setPreferredIds = new Set(
		rtpCapabilities.headerExtensions
			.filter(exten => exten.uri !== headerExtension.uri)
			.map(exten => exten.preferredId)
	);

	let preferredId: number = 1;

	while (setPreferredIds.has(preferredId)) {
		++preferredId;
	}

	const newHeaderExtension = {
		kind: headerExtension.kind,
		uri: headerExtension.uri,
		preferredId,
		preferredEncrypt: false,
		direction: headerExtension.direction,
	};

	rtpCapabilities.headerExtensions.push(newHeaderExtension);
}
