import { EnhancedEventEmitter } from '../EnhancedEventEmitter';
import { ProducerCodecOptions } from '../Producer';
import { IceParameters, IceCandidate, DtlsParameters } from '../Transport';
import { RtpCapabilities, RtpParameters, RtpEncodingParameters } from '../RtpParameters';
import { SctpCapabilities, SctpParameters, SctpStreamParameters } from '../SctpParameters';
export declare type HandlerFactory = (options: HandlerOptions) => HandlerInterface;
export declare type HandlerOptions = {
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
export declare type SendOptions = {
    track: MediaStreamTrack;
    encodings?: RtpEncodingParameters[];
    codecOptions?: ProducerCodecOptions;
};
export declare type SendResult = {
    sendId: string;
    rtpParameters: RtpParameters;
    rtpSender?: RTCRtpSender;
};
export declare type ReceiveOptions = {
    trackId: string;
    kind: 'audio' | 'video';
    rtpParameters: RtpParameters;
};
export declare type ReceiveResult = {
    recvId: string;
    track: MediaStreamTrack;
    rtpReceiver?: RTCRtpReceiver;
};
export declare type SendDataChannelOptions = SctpStreamParameters;
export declare type SendDataChannelResult = {
    dataChannel: RTCDataChannel;
    sctpStreamParameters: SctpStreamParameters;
};
export declare type ReceiveDataChannelOptions = {
    sctpStreamParameters: SctpStreamParameters;
    label?: string;
    protocol?: string;
};
export declare type ReceiveDataChannelResult = {
    dataChannel: RTCDataChannel;
};
export declare abstract class HandlerInterface extends EnhancedEventEmitter {
    constructor();
    abstract close(): void;
    abstract getNativeRtpCapabilities(): Promise<RtpCapabilities>;
    abstract getNativeSctpCapabilities(): Promise<SctpCapabilities>;
    abstract updateIceServers(iceServers: RTCIceServer[]): Promise<void>;
    abstract restartIce(iceParameters: IceParameters): Promise<void>;
    abstract getTransportStats(): Promise<RTCStatsReport>;
    abstract send(options: SendOptions): Promise<SendResult>;
    abstract stopSending(sendId: string): Promise<void>;
    abstract replaceTrack(sendId: string, track: MediaStreamTrack): Promise<void>;
    abstract setMaxSpatialLayer(sendId: string, spatialLayer: number): Promise<void>;
    abstract setRtpEncodingParameters(sendId: string, params: any): Promise<void>;
    abstract getSenderStats(sendId: string): Promise<RTCStatsReport>;
    abstract sendDataChannel(options: SendDataChannelOptions): Promise<SendDataChannelResult>;
    abstract receive(options: ReceiveOptions): Promise<ReceiveResult>;
    abstract stopReceiving(recvId: string): Promise<void>;
    abstract getReceiverStats(recvId: string): Promise<RTCStatsReport>;
    abstract receiveDataChannel(options: ReceiveDataChannelOptions): Promise<ReceiveDataChannelResult>;
}
//# sourceMappingURL=HandlerInterface.d.ts.map