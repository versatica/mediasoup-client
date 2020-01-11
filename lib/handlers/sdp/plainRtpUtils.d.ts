import { MediaKind, RtpEncodingParameters } from '../../RtpParameters';
/**
 * Extract plain RTP parameters from a SDP.
 *
 * @returns {Object} with ip (String), ipVersion (4 or 6 Number) and port (Number).
 */
export declare function extractPlainRtpParameters({ sdpObject, kind }: {
    sdpObject: any;
    kind: MediaKind;
}): any;
export declare function getRtpEncodings({ sdpObject, kind }: {
    sdpObject: any;
    kind: MediaKind;
}): RtpEncodingParameters[];
//# sourceMappingURL=plainRtpUtils.d.ts.map