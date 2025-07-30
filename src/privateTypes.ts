import type {
	MediaKind,
	RtcpFeedback,
	RtpHeaderExtensionUri,
	RtpHeaderExtensionDirection,
} from './RtpParameters';

export type ExtendedRtpCapabilities = {
	codecs: ExtendedRtpCodecCapability[];
	headerExtensions: ExtendedRtpHeaderExtension[];
};

export type ExtendedRtpCodecCapability = {
	mimeType: string;
	kind: MediaKind;
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
