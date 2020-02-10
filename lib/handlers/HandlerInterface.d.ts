import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import { IceParameters } from '../Transport';
import { RtpCapabilities, RtpParameters, RtpEncodingParameters } from '../RtpParameters';
import { SctpCapabilities, SctpStreamParameters } from '../SctpParameters';
export declare abstract class HandlerInterface extends EnhancedEventEmitter {
    constructor();
    abstract close(): void;
    abstract getNativeRtpCapabilities(): Promise<RtpCapabilities>;
    abstract getNativeSctpCapabilities(): Promise<SctpCapabilities>;
    abstract getTransportStats(): Promise<RTCStatsReport>;
    abstract updateIceServers(iceServers: RTCIceServer[]): Promise<void>;
    abstract restartIce(iceParameters: IceParameters): Promise<void>;
    abstract send({ track, encodings, codecOptions }: {
        track: MediaStreamTrack;
        encodings?: RtpEncodingParameters[];
        codecOptions?: ProducerCodecOptions;
    }): Promise<{
        sendId: string;
        rtpSender?: RTCRtpSender;
        rtpParameters: RtpParameters;
    }>;
    abstract stopSending(sendId: string): Promise<void>;
    abstract replaceTrack(sendId: string, track: MediaStreamTrack): Promise<void>;
    abstract setMaxSpatialLayer(sendId: string, spatialLayer: number): Promise<void>;
    abstract setRtpEncodingParameters(sendId: string, params: any): Promise<void>;
    abstract getSenderStats(sendId: string): Promise<RTCStatsReport>;
    abstract receive({ id, kind, rtpParameters }: {
        id: string;
        kind: 'audio' | 'video';
        rtpParameters: RtpParameters;
    }): Promise<{
        recvId: string;
        rtpReceiver?: RTCRtpReceiver;
        rtpParameters: RtpParameters;
    }>;
    abstract stopReceiving(recvId: string): Promise<void>;
    abstract getReceiverStats(recvId: string): Promise<RTCStatsReport>;
    abstract sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: SctpStreamParameters): Promise<{
        dataChannel: RTCDataChannel;
        sctpStreamParameters: SctpStreamParameters;
    }>;
    abstract receiveDataChannel({ sctpStreamParameters, label, protocol }: {
        sctpStreamParameters: SctpStreamParameters;
        label?: string;
        protocol?: string;
    }): Promise<{
        dataChannel: RTCDataChannel;
    }>;
}
//# sourceMappingURL=HandlerInterface.d.ts.map