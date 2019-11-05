import EnhancedEventEmitter from '../EnhancedEventEmitter';
import RemoteSdp from './sdp/RemoteSdp';
import { ProducerCodecOptions } from '../Producer';
import { IceParameters, IceCandidate, DtlsParameters, DtlsRole } from './../Transport';
import { RtpCapabilities, RtpEncodingParameters } from '../RtpParameters';
import { SctpCapabilities, SctpParameters, SctpStreamParameters } from '../SctpParameters';
declare class Handler extends EnhancedEventEmitter {
    protected _transportReady: boolean;
    protected readonly _remoteSdp: RemoteSdp;
    protected readonly _pc: any;
    protected _hasDataChannelMediaSection: boolean;
    protected _nextSctpStreamId: number;
    constructor({ iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints }: {
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
        sctpParameters?: SctpParameters;
        iceServers?: RTCIceServer[];
        iceTransportPolicy?: RTCIceTransportPolicy;
        additionalSettings?: any;
        proprietaryConstraints?: any;
    });
    close(): void;
    getTransportStats(): Promise<any>;
    updateIceServers({ iceServers }: {
        iceServers: RTCIceServer[];
    }): Promise<void>;
    _setupTransport({ localDtlsRole, localSdpObject }: {
        localDtlsRole: DtlsRole;
        localSdpObject?: any;
    }): Promise<void>;
}
export declare class SendHandler extends Handler {
    private readonly _sendingRtpParametersByKind;
    private readonly _sendingRemoteRtpParametersByKind;
    private readonly _stream;
    private readonly _mapIdTrack;
    private _lastId;
    constructor(data: any);
    send({ track, encodings, codecOptions }: {
        track: MediaStreamTrack;
        encodings?: RtpEncodingParameters[];
        codecOptions?: ProducerCodecOptions;
    }): Promise<any>;
    stopSending({ localId }: {
        localId: string;
    }): Promise<void>;
    replaceTrack({ localId, track }: {
        localId: string;
        track: MediaStreamTrack;
    }): Promise<never>;
    setMaxSpatialLayer({ local, spatialLayer }: {
        local: true;
        spatialLayer: number;
    }): Promise<never>;
    setRtpEncodingParameters({ local, params }: {
        local: true;
        params: any;
    }): Promise<never>;
    getSenderStats({ localId }: {
        localId: string;
    }): Promise<never>;
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }: SctpStreamParameters): Promise<any>;
    restartIce({ iceParameters }: {
        iceParameters: IceParameters;
    }): Promise<void>;
}
export default class Chrome55 {
    static readonly label: string;
    static getNativeRtpCapabilities(): Promise<RtpCapabilities>;
    static getNativeSctpCapabilities(): Promise<SctpCapabilities>;
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, extendedRtpCapabilities }: {
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
    });
}
export {};
//# sourceMappingURL=Chrome55.d.ts.map