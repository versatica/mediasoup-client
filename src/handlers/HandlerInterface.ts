import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import { IceParameters } from '../Transport';
import {
	RtpCapabilities,
	RtpParameters,
	RtpEncodingParameters
} from '../RtpParameters';
import {
	SctpCapabilities,
	SctpStreamParameters
} from '../SctpParameters';

export abstract class HandlerInterface extends EnhancedEventEmitter
{
	constructor()
	{
		super();
	}

	abstract close(): void;

	abstract async getNativeRtpCapabilities(): Promise<RtpCapabilities>;

	abstract async getNativeSctpCapabilities(): Promise<SctpCapabilities>;

	abstract async getTransportStats(): Promise<RTCStatsReport>;

	abstract async updateIceServers(iceServers: RTCIceServer[]): Promise<void>;

	abstract async restartIce(iceParameters: IceParameters): Promise<void>;

	abstract async send(
		{
			track,
			encodings,
			codecOptions
		}:
		{
			track: MediaStreamTrack;
			encodings?: RtpEncodingParameters[];
			codecOptions?: ProducerCodecOptions;
		}
	): Promise<
		{
			sendId: string;
			rtpSender?: RTCRtpSender;
			rtpParameters: RtpParameters;
		}
	>;

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

	abstract async receive(
		{
			id,
			kind,
			rtpParameters
		}:
		{
			id: string;
			kind: 'audio' | 'video';
			rtpParameters: RtpParameters
		}
	): Promise<
		{
			recvId: string;
			rtpReceiver?: RTCRtpReceiver;
			rtpParameters: RtpParameters;
		}
	>;

	abstract async stopReceiving(recvId: string): Promise<void>;

	abstract async getReceiverStats(recvId: string): Promise<RTCStatsReport>;

	abstract async sendDataChannel(
		{
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
			priority
		}: SctpStreamParameters
	): Promise<
		{
			dataChannel: RTCDataChannel;
			sctpStreamParameters: SctpStreamParameters;
		}
	>;

	abstract async receiveDataChannel(
		{
			sctpStreamParameters,
			label,
			protocol
		}:
		{
			sctpStreamParameters: SctpStreamParameters;
			label?: string;
			protocol?: string
		}
	): Promise<{ dataChannel: RTCDataChannel }>;
}
