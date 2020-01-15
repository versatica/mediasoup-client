import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import { IceParameters } from '../Transport';
import { RtpParameters, RtpEncodingParameters } from '../RtpParameters';
import { SctpStreamParameters } from '../SctpParameters';

export abstract class HandlerInterface extends EnhancedEventEmitter
{
	constructor()
	{
		super();
	}

	abstract close(): void;

	abstract async getTransportStats(): Promise<any>;

	abstract async updateIceServers(
		{ iceServers }:
		{ iceServers: RTCIceServer[] }
	): Promise<void>
}

export abstract class SendHandlerInterface extends HandlerInterface
{
	constructor()
	{
		super();
	}

	abstract async send(
		{ track, encodings, codecOptions }:
		{
			track: MediaStreamTrack;
			encodings?: RtpEncodingParameters[];
			codecOptions?: ProducerCodecOptions;
		}
	): Promise<any>;

	abstract async stopSending({ localId }: { localId: string }): Promise<void>;

	abstract async replaceTrack(
		{ localId, track }:
		{ localId: string; track: MediaStreamTrack }
	): Promise<void>;

	abstract async setMaxSpatialLayer(
		{ localId, spatialLayer }:
		{ localId: string; spatialLayer: number }
	): Promise<void>;

	abstract async setRtpEncodingParameters(
		{ localId, params }:
		{ localId: string; params: any }
	): Promise<void>;

	abstract async getSenderStats({ localId }: { localId: string }): Promise<any>;

	abstract async sendDataChannel(
		{
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
			priority
		}: SctpStreamParameters
	): Promise<any>;

	abstract async restartIce(
		{ iceParameters }:
		{ iceParameters: IceParameters }
	): Promise<void>;
}

export abstract class RecvHandlerInterface extends HandlerInterface
{
	constructor()
	{
		super();
	}

	abstract async receive(
		{ id, kind, rtpParameters }:
		{ id: string; kind: 'audio' | 'video'; rtpParameters: RtpParameters }
	): Promise<any>;

	abstract async stopReceiving({ localId }: { localId: string }): Promise<void>;

	abstract async getReceiverStats({ localId }: { localId: string }): Promise<any>;

	abstract async receiveDataChannel(
		{ sctpStreamParameters, label, protocol }:
		{ sctpStreamParameters: SctpStreamParameters; label?: string; protocol?: string }
	): Promise<any>;

	abstract async restartIce(
		{ iceParameters }:
		{ iceParameters: IceParameters }
	): Promise<void>;
}
