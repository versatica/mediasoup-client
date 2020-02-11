import { HandlerFactory, HandlerInterface, HandlerOptions, SendOptions, SendResult, ReceiveOptions, ReceiveResult, SendDataChannelOptions, SendDataChannelResult, ReceiveDataChannelOptions, ReceiveDataChannelResult } from './HandlerInterface';
import { IceParameters } from '../Transport';
import { RtpCapabilities } from '../RtpParameters';
import { SctpCapabilities } from '../SctpParameters';
export declare class Chrome74 extends HandlerInterface {
    private readonly _direction;
    private _transportReady;
    private readonly _remoteSdp;
    private readonly _sendingRtpParametersByKind;
    private readonly _sendingRemoteRtpParametersByKind;
    private readonly _pc;
    private readonly _mapMidTransceiver;
    private readonly _sendStream;
    private _hasDataChannelMediaSection;
    private _nextSctpStreamId;
    /**
     * Creates a factory function.
     */
    static createFactory(): HandlerFactory;
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, extendedRtpCapabilities }: HandlerOptions);
    close(): void;
    getNativeRtpCapabilities(): Promise<RtpCapabilities>;
    getNativeSctpCapabilities(): Promise<SctpCapabilities>;
    updateIceServers(iceServers: RTCIceServer[]): Promise<void>;
    restartIce(iceParameters: IceParameters): Promise<void>;
    getTransportStats(): Promise<RTCStatsReport>;
    send({ track, encodings, codecOptions }: SendOptions): Promise<SendResult>;
    stopSending(sendId: string): Promise<void>;
    replaceTrack(sendId: string, track: MediaStreamTrack): Promise<void>;
    setMaxSpatialLayer(sendId: string, spatialLayer: number): Promise<void>;
    setRtpEncodingParameters(sendId: string, params: any): Promise<void>;
    getSenderStats(sendId: string): Promise<any>;
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: SendDataChannelOptions): Promise<SendDataChannelResult>;
    receive({ trackId, kind, rtpParameters }: ReceiveOptions): Promise<ReceiveResult>;
    stopReceiving(recvId: string): Promise<void>;
    getReceiverStats(recvId: string): Promise<RTCStatsReport>;
    receiveDataChannel({ sctpStreamParameters, label, protocol }: ReceiveDataChannelOptions): Promise<ReceiveDataChannelResult>;
    private _setupTransport;
    private assertSendDirection;
    private assertRecvDirection;
}
//# sourceMappingURL=newChrome74.d.ts.map