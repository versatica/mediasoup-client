import EnhancedEventEmitter from './EnhancedEventEmitter';
import { Producer, ProducerOptions } from './Producer';
import { Consumer, ConsumerOptions } from './Consumer';
import { DataProducer, DataProducerOptions } from './DataProducer';
import { DataConsumer, DataConsumerOptions } from './DataConsumer';
export interface CanProduceByKind {
    audio: boolean;
    video: boolean;
    [key: string]: boolean;
}
export interface TransportOptions {
    id: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
    sctpParameters?: TransportSctpParameters;
    iceServers?: RTCIceServer[];
    iceTransportPolicy?: RTCIceTransportPolicy;
    additionalSettings?: any;
    proprietaryConstraints?: any;
    appData?: any;
}
export interface IceParameters {
    /**
     * ICE username fragment.
     * */
    usernameFragment?: string;
    /**
     * ICE password.
     */
    password?: string;
    /**
     * ICE Lite.
     */
    iceLite: boolean;
}
export interface IceCandidate {
    /**
     * Unique identifier that allows ICE to correlate candidates that appear on
     * multiple transports.
     */
    foundation: string;
    /**
     * The assigned priority of the candidate.
     */
    priority: number;
    /**
     * The IP address of the candidate.
     */
    ip: string;
    /**
     * The protocol of the candidate ('udp' / 'tcp').
     */
    protocol: 'udp' | 'tcp';
    /**
     * The port for the candidate.
     */
    port: number;
    /**
     * The type of candidate (always 'host').
     */
    type: 'host';
    /**
     * The type of TCP candidate (always 'passive').
     */
    tcpType: 'passive';
}
export interface DtlsParameters {
    /**
     * DTLS role. Default 'auto'.
     */
    role?: DtlsRole;
    /**
     * DTLS fingerprints.
     */
    fingerprints: DtlsFingerprints[];
}
/**
 * Map of DTLS algorithms (as defined in the 'Hash function Textual Names'
 * registry initially specified in RFC 4572 Section 8) and their corresponding
 * certificate fingerprint values (in lowercase hex string as expressed
 * utilizing the syntax of 'fingerprint' in RFC 4572 Section 5).
 */
export interface DtlsFingerprints {
    'sha-1'?: string;
    'sha-224'?: string;
    'sha-256'?: string;
    'sha-384'?: string;
    'sha-512'?: string;
}
export interface TransportSctpParameters {
    /**
     * Must always equal 5000.
     */
    port: number;
    /**
     * Initially requested number of outgoing SCTP streams.
     */
    OS: number;
    /**
     * Maximum number of incoming SCTP streams.
     */
    MIS: number;
    /**
     * Maximum allowed size for SCTP messages.
     */
    maxMessageSize: number;
}
export declare type DtlsRole = 'auto' | 'client' | 'server';
declare type ConnectionState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed';
interface InternalTransportOptions extends TransportOptions {
    direction: 'send' | 'recv';
    Handler: any;
    extendedRtpCapabilities: any;
    canProduceByKind: CanProduceByKind;
}
export declare class Transport extends EnhancedEventEmitter {
    private _id;
    private _closed;
    private _direction;
    private _extendedRtpCapabilities;
    private _canProduceByKind;
    private _maxSctpMessageSize?;
    private _handler;
    private _connectionState;
    private _appData;
    private _producers;
    private _consumers;
    private _dataProducers;
    private _dataConsumers;
    private _probatorConsumerCreated;
    private _awaitQueue;
    /**
     * @emits {transportLocalParameters: Object, callback: Function, errback: Function} connect
     * @emits {connectionState: String} connectionstatechange
     * @emits {producerLocalParameters: Object, callback: Function, errback: Function} produce
     * @emits {dataProducerLocalParameters: Object, callback: Function, errback: Function} producedata
     */
    constructor({ direction, id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData, Handler, extendedRtpCapabilities, canProduceByKind }: InternalTransportOptions);
    /**
     * Transport id.
     */
    readonly id: string;
    /**
     * Whether the Transport is closed.
     */
    readonly closed: boolean;
    /**
     * Transport direction.
     */
    readonly direction: 'send' | 'recv';
    /**
     * RTC handler instance.
     */
    readonly handler: any;
    /**
     * Connection state.
     */
    readonly connectionState: ConnectionState;
    /**
     * App custom data.
     */
    /**
    * Invalid setter.
    */
    appData: any;
    /**
     * Close the Transport.
     */
    close(): void;
    /**
     * Get associated Transport (RTCPeerConnection) stats.
     *
     * @returns {RTCStatsReport}
     */
    getStats(): Promise<any>;
    /**
     * Restart ICE connection.
     */
    restartIce({ iceParameters }: {
        iceParameters: IceParameters;
    }): Promise<void>;
    /**
     * Update ICE servers.
     */
    updateIceServers({ iceServers }?: {
        iceServers?: RTCIceServer[];
    }): Promise<void>;
    /**
     * Create a Producer.
     */
    produce({ track, encodings, codecOptions, appData }?: ProducerOptions): Promise<Producer>;
    /**
     * Create a Consumer to consume a remote Producer.
     */
    consume({ id, producerId, kind, rtpParameters, appData }?: ConsumerOptions): Promise<Consumer>;
    /**
     * Create a DataProducer
     */
    produceData({ ordered, maxPacketLifeTime, maxRetransmits, priority, label, protocol, appData }?: DataProducerOptions): Promise<DataProducer>;
    /**
     * Create a DataConsumer
     */
    consumeData({ id, dataProducerId, sctpStreamParameters, label, protocol, appData }?: DataConsumerOptions): Promise<DataConsumer>;
    _handleHandler(): void;
    _handleProducer(producer: Producer): void;
    _handleConsumer(consumer: Consumer): void;
    _handleDataProducer(dataProducer: DataProducer): void;
    _handleDataConsumer(dataConsumer: DataConsumer): void;
}
export {};
//# sourceMappingURL=Transport.d.ts.map