import { HandlerInterface, HandlerRunOptions, HandlerSendOptions, HandlerSendResult, HandlerReceiveOptions, HandlerReceiveResult, HandlerSendDataChannelOptions, HandlerSendDataChannelResult, HandlerReceiveDataChannelOptions, HandlerReceiveDataChannelResult } from './HandlerInterface';
import { IceParameters } from '../Transport';
import { RtpCapabilities } from '../RtpParameters';
import { SctpCapabilities } from '../SctpParameters';
export declare class FakeHandler extends HandlerInterface {
    private fakeParameters;
    private _rtpParametersByKind;
    private _cname;
    private _transportReady;
    private _nextLocalId;
    private _tracks;
    private _nextSctpStreamId;
    /**
     * Creates a factory function.
     */
    static createFactory(fakeParameters: any): () => FakeHandler;
    constructor(fakeParameters: any);
    get name(): string;
    close(): void;
    setConnectionState(connectionState: string): void;
    getNativeRtpCapabilities(): Promise<RtpCapabilities>;
    getNativeSctpCapabilities(): Promise<SctpCapabilities>;
    run({ direction, // eslint-disable-line no-unused-vars
    iceParameters, // eslint-disable-line no-unused-vars
    iceCandidates, // eslint-disable-line no-unused-vars
    dtlsParameters, // eslint-disable-line no-unused-vars
    sctpParameters, // eslint-disable-line no-unused-vars
    iceServers, // eslint-disable-line no-unused-vars
    iceTransportPolicy, // eslint-disable-line no-unused-vars
    proprietaryConstraints, // eslint-disable-line no-unused-vars
    extendedRtpCapabilities }: HandlerRunOptions): void;
    updateIceServers(iceServers: RTCIceServer[]): Promise<void>;
    restartIce(iceParameters: IceParameters): Promise<void>;
    getTransportStats(): Promise<RTCStatsReport>;
    send({ track, encodings, codecOptions, codec }: HandlerSendOptions): Promise<HandlerSendResult>;
    stopSending(localId: string): Promise<void>;
    replaceTrack(localId: string, track: MediaStreamTrack | null): Promise<void>;
    setMaxSpatialLayer(localId: string, spatialLayer: number): Promise<void>;
    setRtpEncodingParameters(localId: string, params: any): Promise<void>;
    getSenderStats(localId: string): Promise<RTCStatsReport>;
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: HandlerSendDataChannelOptions): Promise<HandlerSendDataChannelResult>;
    receive({ trackId, kind, rtpParameters }: HandlerReceiveOptions): Promise<HandlerReceiveResult>;
    stopReceiving(localId: string): Promise<void>;
    getReceiverStats(localId: string): Promise<RTCStatsReport>;
    receiveDataChannel({ sctpStreamParameters, label, protocol }: HandlerReceiveDataChannelOptions): Promise<HandlerReceiveDataChannelResult>;
    private _setupTransport;
}
//# sourceMappingURL=FakeHandler.d.ts.map