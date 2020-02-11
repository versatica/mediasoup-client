import { DtlsParameters } from '../../Transport';
import { RtpCapabilities } from '../../RtpParameters';
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
    offerRtpParameters: any;
    answerMediaObject: any;
}): void;
//# sourceMappingURL=commonUtils.d.ts.map