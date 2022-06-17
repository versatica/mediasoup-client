import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { SctpStreamParameters } from './SctpParameters';
export declare type DataProducerOptions = {
    ordered?: boolean;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    label?: string;
    protocol?: string;
    appData?: Record<string, unknown>;
};
export declare class DataProducer extends EnhancedEventEmitter {
    private readonly _id;
    private readonly _dataChannel;
    private _closed;
    private readonly _sctpStreamParameters;
    private readonly _appData;
    protected readonly _observer: EnhancedEventEmitter;
    /**
     * @emits transportclose
     * @emits open
     * @emits error - (error: Error)
     * @emits close
     * @emits bufferedamountlow
     * @emits @close
     */
    constructor({ id, dataChannel, sctpStreamParameters, appData }: {
        id: string;
        dataChannel: RTCDataChannel;
        sctpStreamParameters: SctpStreamParameters;
        appData?: Record<string, unknown>;
    });
    /**
     * DataProducer id.
     */
    get id(): string;
    /**
     * Whether the DataProducer is closed.
     */
    get closed(): boolean;
    /**
     * SCTP stream parameters.
     */
    get sctpStreamParameters(): SctpStreamParameters;
    /**
     * DataChannel readyState.
     */
    get readyState(): RTCDataChannelState;
    /**
     * DataChannel label.
     */
    get label(): string;
    /**
     * DataChannel protocol.
     */
    get protocol(): string;
    /**
     * DataChannel bufferedAmount.
     */
    get bufferedAmount(): number;
    /**
     * DataChannel bufferedAmountLowThreshold.
     */
    get bufferedAmountLowThreshold(): number;
    /**
     * Set DataChannel bufferedAmountLowThreshold.
     */
    set bufferedAmountLowThreshold(bufferedAmountLowThreshold: number);
    /**
     * App custom data.
     */
    get appData(): Record<string, unknown>;
    /**
     * Invalid setter.
     */
    set appData(appData: Record<string, unknown>);
    /**
     * Observer.
     *
     * @emits close
     */
    get observer(): EnhancedEventEmitter;
    /**
     * Closes the DataProducer.
     */
    close(): void;
    /**
     * Transport was closed.
     */
    transportClosed(): void;
    /**
     * Send a message.
     *
     * @param {String|Blob|ArrayBuffer|ArrayBufferView} data.
     */
    send(data: any): void;
    private _handleDataChannel;
}
//# sourceMappingURL=DataProducer.d.ts.map