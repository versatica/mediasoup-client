import { DtlsParameters } from '../../Transport';
import { RtpCapabilities, RtpHeaderExtensionParameters, RtpParameters } from '../../RtpParameters';
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
/**
 * Adds the given RTP extension to the given SDP media object and returns a
 * RtpHeaderExtensionParameters object.
 * If the extension is already present, this function doesn't add anything and
 * doesn't return anything.
 */
export declare function addRtpExtensionToMediaObject({ mediaObject, uri }: {
    mediaObject: any;
    uri: string;
}): RtpHeaderExtensionParameters | undefined;
/**
 * Adds the given RTP extension to the given RTP parameters.
 * If the extension is already present (with same id), this function doesn't
 * add anything. If the extension is present with a different id, then existing
 * one is removed and the new one is added.
 */
export declare function addRtpExtensionToRtpParameters({ rtpParameters, extension }: {
    rtpParameters: RtpParameters;
    extension: RtpHeaderExtensionParameters;
}): void;
//# sourceMappingURL=commonUtils.d.ts.map