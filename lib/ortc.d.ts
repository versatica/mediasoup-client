import { RtpParameters, RtpCapabilities } from './RtpParameters';
/**
 * Generate extended RTP capabilities for sending and receiving.
 */
export declare function getExtendedRtpCapabilities(localCaps: RtpCapabilities, remoteCaps: RtpCapabilities): any;
/**
 * Generate RTP capabilities for receiving media based on the given extended
 * RTP capabilities.
 */
export declare function getRecvRtpCapabilities(extendedRtpCapabilities: any): RtpCapabilities;
/**
 * Generate RTP parameters of the given kind for sending media.
 * Just the first media codec per kind is considered.
 * NOTE: mid, encodings and rtcp fields are left empty.
 */
export declare function getSendingRtpParameters(kind: 'audio' | 'video', extendedRtpCapabilities: any): RtpParameters;
/**
 * Generate RTP parameters of the given kind suitable for the remote SDP answer.
 */
export declare function getSendingRemoteRtpParameters(kind: 'audio' | 'video', extendedRtpCapabilities: any): RtpParameters;
/**
 * Whether media can be sent based on the given RTP capabilities.
 */
export declare function canSend(kind: 'audio' | 'video', extendedRtpCapabilities: any): boolean;
/**
 * Whether the given RTP parameters can be received with the given RTP
 * capabilities.
 */
export declare function canReceive(rtpParameters: RtpParameters, extendedRtpCapabilities: any): boolean;
/**
 * Create RTP parameters for a Consumer for the RTP probator.
 */
export declare function generateProbatorRtpParameters(videoRtpParameters: RtpParameters): RtpParameters;
//# sourceMappingURL=ortc.d.ts.map