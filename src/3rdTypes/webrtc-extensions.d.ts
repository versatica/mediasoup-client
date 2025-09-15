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
