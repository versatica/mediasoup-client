import EnhancedEventEmitter from '../EnhancedEventEmitter';
import RemoteSdp from './sdp/RemoteSdp';
import { IceParameters, IceCandidate, DtlsParameters, DtlsRole, TransportSctpParameters } from '../Transport';
import { ProducerCodecOptions } from '../Producer';
import { SctpStreamParameters } from '../SctpParameters';
declare class Handler extends EnhancedEventEmitter {
    protected _transportReady: boolean;
    protected _remoteSdp: RemoteSdp;
    protected _pc: any;
    protected _hasDataChannelMediaSection: boolean;
    protected _nextSctpStreamId: number;
    constructor({ iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints }: {
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
        sctpParameters: TransportSctpParameters;
        iceServers: RTCIceServer[];
        iceTransportPolicy: RTCIceTransportPolicy;
        additionalSettings: any;
        proprietaryConstraints: any;
    });
    close(): void;
    getTransportStats(): Promise<any>;
    updateIceServers({ iceServers }: {
        iceServers: RTCIceServer[];
    }): Promise<void>;
    _setupTransport({ localDtlsRole, localSdpObject }: {
        localDtlsRole: DtlsRole;
        localSdpObject: any | null;
    }): Promise<void>;
}
export declare class SendHandler extends Handler {
    private _sendingRtpParametersByKind;
    private _sendingRemoteRtpParametersByKind;
    private _stream;
    private _mapIdTrack;
    private _lastId;
    constructor(data: any);
    send({ track, encodings, codecOptions }: {
        track: MediaStreamTrack;
        encodings: RTCRtpEncodingParameters[];
        codecOptions: ProducerCodecOptions;
    }): Promise<any>;
    stopSending({ localId }: {
        localId: number;
    }): Promise<void>;
    replaceTrack({ localId, track }: {
        localId: string;
        track: MediaStreamTrack;
    }): Promise<Error>;
    setMaxSpatialLayer({ localId, spatialLayer }: {
        localId: string;
        spatialLayer: number;
    }): Promise<Error>;
    getSenderStats({ localId }: {
        localId: string;
    }): Promise<Error>;
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: SctpStreamParameters): Promise<any>;
    restartIce({ iceParameters }: {
        iceParameters: IceParameters;
    }): Promise<void>;
}
export default class ReactNative {
    static readonly label: string;
    static getNativeRtpCapabilities(): Promise<any>;
    static getNativeSctpCapabilities(): Promise<any>;
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, extendedRtpCapabilities }: {
        direction: 'send' | 'recv';
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
        sctpParameters: TransportSctpParameters;
        iceServers: RTCIceServer[];
        iceTransportPolicy: RTCIceTransportPolicy;
        additionalSettings: any;
        proprietaryConstraints: any;
        extendedRtpCapabilities: any;
    });
}
export {};
//# sourceMappingURL=ReactNative.d.ts.map