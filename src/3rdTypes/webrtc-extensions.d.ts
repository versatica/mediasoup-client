/**
 * Extend RTCRtpEncodingParameters with scalabilityMode field which is missing
 * in DOM types.
 *
 * @see https://www.w3.org/TR/webrtc-svc/
 *
 * @remarks No need to extend from anywhere since by default TypeScript
 * automatically merges interfaces with the same name.
 */
interface RTCRtpEncodingParameters {
	scalabilityMode?: string;
}

/**
 * Extend RTCRtpHeaderExtensionCapability with the direction field, and
 * RTCRtpTransceiver with the header extension negotiation methods, all missing
 * in DOM types.
 *
 * @see https://w3c.github.io/webrtc-extensions/#rtp-header-extension-control
 *
 * @remarks No need to extend from anywhere since by default TypeScript
 * automatically merges interfaces with the same name.
 */
interface RTCRtpHeaderExtensionCapability {
	direction?: RTCRtpTransceiverDirection;
}

interface RTCRtpTransceiver {
	getHeaderExtensionsToNegotiate?(): RTCRtpHeaderExtensionCapability[];
	setHeaderExtensionsToNegotiate?(
		extensions: RTCRtpHeaderExtensionCapability[]
	): void;
	getNegotiatedHeaderExtensions?(): RTCRtpHeaderExtensionCapability[];
}
