import { RtpCapabilities, RtpParameters } from '../../RtpParameters';
/**
 * Normalize Edge's RTCRtpReceiver.getCapabilities() to produce a full
 * compliant ORTC RTCRtpCapabilities.
 */
export declare function getCapabilities(): RtpCapabilities;
/**
 * Generate RTCRtpParameters as Edge like them.
 */
export declare function mangleRtpParameters(rtpParameters: RtpParameters): RtpParameters;
//# sourceMappingURL=edgeUtils.d.ts.map