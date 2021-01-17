import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import {
	IceParameters,
	IceCandidate,
	DtlsParameters
} from '../Transport';
import {
	RtpCapabilities,
	RtpCodecCapability,
	RtpParameters,
	RtpEncodingParameters
} from '../RtpParameters';
import {
	SctpCapabilities,
	SctpParameters,
	SctpStreamParameters
} from '../SctpParameters';

export type HandlerFactory = () => HandlerInterface;

export type HandlerRunOptions =
{
	direction: 'send' | 'recv';
	iceParameters: IceParameters;
	iceCandidates: IceCandidate[];
	dtlsParameters: DtlsParameters;
	sctpParameters?: SctpParameters;
	iceServers?: RTCIceServer[];
	iceTransportPolicy?: RTCIceTransportPolicy;
	additionalSettings?: any;
	proprietaryConstraints?: any;
	extendedRtpCapabilities: any;
};

export type HandlerSendOptions =
{
	track: MediaStreamTrack;
	encodings?: RtpEncodingParameters[];
	codecOptions?: ProducerCodecOptions;
	codec?: RtpCodecCapability;
};

export type HandlerSendResult =
{
	localId: string;
	rtpParameters: RtpParameters;
	rtpSender?: RTCRtpSender;
};

export type HandlerReceiveOptions =
{
	trackId: string;
	kind: 'audio' | 'video';
	rtpParameters: RtpParameters;
};

export type HandlerReceiveResult =
{
	localId: string;
	track: MediaStreamTrack;
	rtpReceiver?: RTCRtpReceiver;
};

export type HandlerSendDataChannelOptions = SctpStreamParameters;

export type HandlerSendDataChannelResult =
{
	dataChannel: RTCDataChannel;
	sctpStreamParameters: SctpStreamParameters;
};

export type HandlerReceiveDataChannelOptions =
{
	sctpStreamParameters: SctpStreamParameters;
	label?: string;
	protocol?: string;
}

export type HandlerReceiveDataChannelResult =
{
	dataChannel: RTCDataChannel;
}

export abstract class HandlerInterface extends EnhancedEventEmitter
{
	/**
	 * @emits @connect - (
	 *     { dtlsParameters: DtlsParameters },
	 *     callback: Function,
	 *     errback: Function
	 *   )
	 * @emits @connectionstatechange - (connectionState: ConnectionState)
	 */
	constructor()
	{
		super();
	}

	abstract get name(): string;

	abstract close(): void;

	abstract getNativeRtpCapabilities(): Promise<RtpCapabilities>;

	abstract getNativeSctpCapabilities(): Promise<SctpCapabilities>;

	abstract run(options: HandlerRunOptions): void;

	abstract updateIceServers(iceServers: RTCIceServer[]): Promise<void>;

	abstract restartIce(iceParameters: IceParameters): Promise<void>;

	abstract getTransportStats(): Promise<RTCStatsReport>;

	abstract send(options: HandlerSendOptions): Promise<HandlerSendResult>;

	abstract stopSending(localId: string): Promise<void>;

	abstract replaceTrack(
		localId: string, track: MediaStreamTrack | null
	): Promise<void>;

	abstract setMaxSpatialLayer(
		localId: string, spatialLayer: number
	): Promise<void>;

	abstract setRtpEncodingParameters(
		localId: string, params: any
	): Promise<void>;

	abstract getSenderStats(localId: string): Promise<RTCStatsReport>;

	abstract sendDataChannel(
		options: HandlerSendDataChannelOptions
	): Promise<HandlerSendDataChannelResult>;

	abstract receive(
		options: HandlerReceiveOptions
	): Promise<HandlerReceiveResult>;

	abstract stopReceiving(localId: string): Promise<void>;

	abstract getReceiverStats(localId: string): Promise<RTCStatsReport>;

	abstract receiveDataChannel(
		options: HandlerReceiveDataChannelOptions
	): Promise<HandlerReceiveDataChannelResult>;
}
