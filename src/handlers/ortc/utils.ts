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
	let preferredId: number | undefined;

	// Look for an already existing header extension with same `uri`. Don't
	// try to match `kind` since all media sections in a Bundle SDP must share
	// same `id` in extensions with same `uri` (as per spec). So if we are
	// adding an audio extension and there is already a video extension with
	// same `uri`, then reuse its preferred `id`.
	const existingHeaderExtension = rtpCapabilities.headerExtensions?.find(
		exten => exten.uri === headerExtension.uri
	);

	if (existingHeaderExtension) {
		if (existingHeaderExtension.kind === headerExtension.kind) {
			return;
		} else {
			preferredId = existingHeaderExtension.preferredId;
		}
	}

	if (!rtpCapabilities.headerExtensions) {
		rtpCapabilities.headerExtensions = [];
	}

	if (preferredId === undefined) {
		preferredId = 1;

		const setPreferredIds = new Set(
			rtpCapabilities.headerExtensions.map(exten => exten.preferredId)
		);

		while (setPreferredIds.has(preferredId)) {
			++preferredId;
		}
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

export function getMsidStreamIdAndTrackId(msid?: string): {
	msidStreamId?: string;
	msidTrackId?: string;
} {
	if (!msid || typeof msid !== 'string') {
		return { msidStreamId: undefined, msidTrackId: undefined };
	}

	/**
	 * `msidStreamId` must be an id or '-' (no stream).
	 * `msidTrackId` is an optional id.
	 */
	const [msidStreamId, msidTrackId] = msid.trim().split(/\s+/);

	if (!msidStreamId) {
		return { msidStreamId: undefined, msidTrackId: undefined };
	}

	return { msidStreamId, msidTrackId };
}
