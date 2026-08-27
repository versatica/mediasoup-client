import type { HandlerForcedRtpExtensions } from '../../handlers/HandlerInterface';
import type {
	RtpCapabilities,
	RtpHeaderExtensionUri,
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

/**
 * Apply given desired RTP extension to the given RTCRtpTransceiver.
 *
 * @see https://w3c.github.io/webrtc-extensions/#rtp-header-extension-control
 */
export function applyForcedRtpExtensions(
	transceiver: RTCRtpTransceiver,
	forcedRtpExtensions: HandlerForcedRtpExtensions
): boolean {
	// If the RTP header extension control API is not available then abort.
	if (
		!transceiver.getHeaderExtensionsToNegotiate ||
		!transceiver.setHeaderExtensionsToNegotiate
	) {
		return false;
	}

	if (Object.keys(forcedRtpExtensions).length === 0) {
		return false;
	}

	let extensionsToNegotiate = transceiver.getHeaderExtensionsToNegotiate();

	extensionsToNegotiate = extensionsToNegotiate.map(
		(extenCap: RTCRtpHeaderExtensionCapability) => {
			const uri = extenCap.uri as RtpHeaderExtensionUri;
			const enabled: boolean | undefined = forcedRtpExtensions[uri];

			if (enabled === true) {
				extenCap.direction = 'sendrecv';
			} else if (enabled === false) {
				extenCap.direction = 'stopped';
			}

			return extenCap;
		}
	);

	transceiver.setHeaderExtensionsToNegotiate(extensionsToNegotiate);

	return true;
}
