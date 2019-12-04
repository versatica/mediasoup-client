import Transport, { TransportOptions } from './Transport';
import { RtpCapabilities } from './RtpParameters';
export declare function detectDevice(): any | undefined;
export default class Device {
    private readonly _Handler;
    private _loaded;
    private _extendedRtpCapabilities;
    private _recvRtpCapabilities?;
    private readonly _canProduceByKind;
    private _sctpCapabilities;
    /**
     * Create a new Device to connect to mediasoup server.
     *
     * @param {Class|String} [Handler] - An optional RTC handler class for unsupported or
     *   custom devices (not needed when running in a browser). If a String, it will
     *   force usage of the given built-in handler.
     *
     * @throws {UnsupportedError} if device is not supported.
     */
    constructor({ Handler }?: {
        Handler?: string | any;
    });
    /**
     * The RTC handler class name ('Chrome70', 'Firefox65', etc).
     */
    readonly handlerName: string;
    /**
     * Whether the Device is loaded.
     */
    readonly loaded: boolean;
    /**
     * RTP capabilities of the Device for receiving media.
     *
     * @throws {InvalidStateError} if not loaded.
     */
    readonly rtpCapabilities: RtpCapabilities | undefined;
    /**
     * SCTP capabilities of the Device.
     *
     * @throws {InvalidStateError} if not loaded.
     */
    readonly sctpCapabilities: any;
    /**
     * Initialize the Device.
     */
    load({ routerRtpCapabilities }?: {
        routerRtpCapabilities?: RtpCapabilities;
    }): Promise<void>;
    /**
     * Whether we can produce audio/video.
     *
     * @throws {InvalidStateError} if not loaded.
     * @throws {TypeError} if wrong arguments.
     */
    canProduce(kind: 'audio' | 'video'): boolean;
    /**
     * Creates a Transport for sending media.
     *
     * @throws {InvalidStateError} if not loaded.
     * @throws {TypeError} if wrong arguments.
     */
    createSendTransport({ id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData }: TransportOptions): Transport;
    /**
     * Creates a Transport for receiving media.
     *
     * @throws {InvalidStateError} if not loaded.
     * @throws {TypeError} if wrong arguments.
     */
    createRecvTransport({ id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData }: TransportOptions): Transport;
    private _createTransport;
}
//# sourceMappingURL=Device.d.ts.map