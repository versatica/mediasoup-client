import type {
	MediaKind,
	RtcpFeedback,
	RtpHeaderExtensionUri,
	RtpHeaderExtensionDirection,
} from './RtpParameters';

/**
 * Extended RTP capabilities are a superset of RTP capabilities that include
 * information about sending and receiving ids.
 *
 * @remarks
 * - Only intended for internal purposes.
 *
 * @private
 */
export type ExtendedRtpCapabilities = {
	codecs: ExtendedRtpCodecCapability[];
	headerExtensions: ExtendedRtpHeaderExtension[];
};

export type ExtendedRtpCodecCapability = {
	kind: MediaKind;
	mimeType: string;
	localPayloadType: number;
	localRtxPayloadType?: number;
	remotePayloadType: number;
	remoteRtxPayloadType?: number;
	clockRate: number;
	channels?: number;
	localParameters: Record<string, unknown>;
	remoteParameters: Record<string, unknown>;
	rtcpFeedback?: RtcpFeedback[];
};

export type ExtendedRtpHeaderExtension = {
	kind: MediaKind;
	uri: RtpHeaderExtensionUri;
	sendId: number;
	recvId: number;
	encrypt: boolean;
	direction: RtpHeaderExtensionDirection;
};
