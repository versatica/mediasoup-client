import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import {
	IceParameters,
	IceCandidate,
	DtlsParameters
} from '../Transport';
import {
	RtpCapabilities,
	RtpParameters,
	RtpEncodingParameters
} from '../RtpParameters';
import {
	SctpCapabilities,
	SctpParameters,
	SctpStreamParameters
} from '../SctpParameters';

export type HandlerFactory = (options: HandlerOptions) => HandlerInterface;

export type HandlerOptions =
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

export type SendOptions =
{
	track: MediaStreamTrack;
	encodings?: RtpEncodingParameters[];
	codecOptions?: ProducerCodecOptions;
};

export type SendResult =
{
	sendId: string;
	rtpParameters: RtpParameters;
	rtpSender?: RTCRtpSender;
};

export type ReceiveOptions =
{
	trackId: string;
	kind: 'audio' | 'video';
	rtpParameters: RtpParameters;
};

export type ReceiveResult =
{
	recvId: string;
	track: MediaStreamTrack;
	rtpReceiver?: RTCRtpReceiver;
};

export type SendDataChannelOptions = SctpStreamParameters;

export type SendDataChannelResult =
{
	dataChannel: RTCDataChannel;
	sctpStreamParameters: SctpStreamParameters;
};

export type ReceiveDataChannelOptions =
{
	sctpStreamParameters: SctpStreamParameters;
	label?: string;
	protocol?: string;
}

export type ReceiveDataChannelResult =
{
	dataChannel: RTCDataChannel;
}

export abstract class HandlerInterface extends EnhancedEventEmitter
{
	constructor()
	{
		super();
	}

	abstract close(): void;

	abstract async getNativeRtpCapabilities(): Promise<RtpCapabilities>;

	abstract async getNativeSctpCapabilities(): Promise<SctpCapabilities>;

	abstract async updateIceServers(iceServers: RTCIceServer[]): Promise<void>;

	abstract async restartIce(iceParameters: IceParameters): Promise<void>;

	abstract async getTransportStats(): Promise<RTCStatsReport>;

	abstract async send(options: SendOptions): Promise<SendResult>;

	abstract async stopSending(sendId: string): Promise<void>;

	abstract async replaceTrack(sendId: string, track: MediaStreamTrack): Promise<void>;

	abstract async setMaxSpatialLayer(
		sendId: string,
		spatialLayer: number
	): Promise<void>;

	abstract async setRtpEncodingParameters(
		sendId: string,
		params: any
	): Promise<void>;

	abstract async getSenderStats(sendId: string): Promise<RTCStatsReport>;

	abstract async sendDataChannel(
		options: SendDataChannelOptions
	): Promise<SendDataChannelResult>;

	abstract async receive(options: ReceiveOptions): Promise<ReceiveResult>;

	abstract async stopReceiving(recvId: string): Promise<void>;

	abstract async getReceiverStats(recvId: string): Promise<RTCStatsReport>;

	abstract async receiveDataChannel(
		options: ReceiveDataChannelOptions
	): Promise<ReceiveDataChannelResult>;
}
