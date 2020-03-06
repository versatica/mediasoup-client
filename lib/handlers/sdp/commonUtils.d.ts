import { DtlsParameters } from '../../Transport';
import { RtpCapabilities, RtpParameters } from '../../RtpParameters';
export declare function extractRtpCapabilities({ sdpObject }: {
    sdpObject: any;
}): RtpCapabilities;
export declare function extractDtlsParameters({ sdpObject }: {
    sdpObject: any;
}): DtlsParameters;
export declare function getCname({ offerMediaObject }: {
    offerMediaObject: any;
}): string;
/**
 * Apply codec parameters in the given SDP m= section answer based on the
 * given RTP parameters of an offer.
 */
export declare function applyCodecParameters({ offerRtpParameters, answerMediaObject }: {
    offerRtpParameters: RtpParameters;
    answerMediaObject: any;
}): void;
//# sourceMappingURL=commonUtils.d.ts.map