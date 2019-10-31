import EnhancedEventEmitter from '../EnhancedEventEmitter';
import { IceParameters, IceCandidate, DtlsParameters, DtlsRole } from '../Transport';
import { RtpParameters, RtpEncodingParameters } from '../RtpParametersAndCapabilities';
export default class Edge11 extends EnhancedEventEmitter {
    static readonly label: string;
    static getNativeRtpCapabilities(): Promise<any>;
    static getNativeSctpCapabilities(): Promise<any>;
    private _sendingRtpParametersByKind;
    private _remoteIceParameters;
    private _remoteIceCandidates;
    private _remoteDtlsParameters;
    private _transportReady;
    private _iceGatherer;
    private _iceTransport;
    private _dtlsTransport;
    private _rtpSenders;
    private _rtpReceivers;
    private _lastSendId;
    private _cname;
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, iceServers, iceTransportPolicy, proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
    extendedRtpCapabilities }: {
        direction: 'send' | 'recv';
        iceParameters: IceParameters;
        iceCandidates: IceCandidate[];
        dtlsParameters: DtlsParameters;
        iceServers: RTCIceServer[];
        iceTransportPolicy: RTCIceTransportPolicy;
        proprietaryConstraints: any;
        extendedRtpCapabilities: any;
    });
    close(): void;
    getTransportStats(): Promise<any>;
    send({ track, encodings }: {
        track: MediaStreamTrack;
        encodings: RtpEncodingParameters[];
    }): Promise<any>;
    stopSending({ localId }: {
        localId: string;
    }): Promise<void>;
    replaceTrack({ localId, track }: {
        localId: string;
        track: MediaStreamTrack;
    }): Promise<void>;
    setMaxSpatialLayer({ localId, spatialLayer }: {
        localId: string;
        spatialLayer: number;
    }): Promise<void>;
    getSenderStats({ localId }: {
        localId: string;
    }): Promise<any>;
    sendDataChannel(): Promise<Error>;
    receive({ id, kind, rtpParameters }: {
        id: string;
        kind: 'audio' | 'video';
        rtpParameters: RtpParameters;
    }): Promise<any>;
    stopReceiving({ localId }: {
        localId: string;
    }): Promise<void>;
    getReceiverStats({ localId }: {
        localId: string;
    }): Promise<any>;
    receiveDataChannel(): Promise<Error>;
    restartIce({ iceParameters }: {
        iceParameters: IceParameters;
    }): Promise<void>;
    updateIceServers({ iceServers }: {
        iceServers: RTCIceServer[];
    }): Promise<Error>;
    _setIceGatherer({ iceServers, iceTransportPolicy }: {
        iceServers: RTCIceServer[];
        iceTransportPolicy: RTCIceTransportPolicy;
    }): void;
    _setIceTransport(): void;
    _setDtlsTransport(): void;
    _setupTransport({ localDtlsRole }: {
        localDtlsRole: DtlsRole;
    }): Promise<void>;
}
//# sourceMappingURL=Edge11.d.ts.map