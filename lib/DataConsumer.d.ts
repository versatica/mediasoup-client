import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { SctpStreamParameters } from './SctpParameters';
export declare type DataConsumerOptions = {
    id?: string;
    dataProducerId?: string;
    sctpStreamParameters: SctpStreamParameters;
    label?: string;
    protocol?: string;
    appData?: any;
};
export declare class DataConsumer extends EnhancedEventEmitter {
    private readonly _id;
    private readonly _dataProducerId;
    private readonly _dataChannel;
    private _closed;
    private readonly _sctpStreamParameters;
    private readonly _appData;
    /**
     * @emits transportclose
     * @emits open
     * @emits error - (error: Error)
     * @emits close
     * @emits message - (message: any)
     * @emits @close
     */
    constructor({ id, dataProducerId, dataChannel, sctpStreamParameters, appData }: {
        id: string;
        dataProducerId: string;
        dataChannel: RTCDataChannel;
        sctpStreamParameters: SctpStreamParameters;
        appData: any;
    });
    /**
     * DataConsumer id.
     */
    get id(): string;
    /**
     * Associated DataProducer id.
     */
    get dataProducerId(): string;
    /**
     * Whether the DataConsumer is closed.
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
     * DataChannel binaryType.
     */
    get binaryType(): string;
    /**
     * Set DataChannel binaryType.
     */
    set binaryType(binaryType: string);
    /**
     * App custom data.
     */
    get appData(): any;
    /**
     * Invalid setter.
     */
    set appData(appData: any);
    /**
     * Closes the DataConsumer.
     */
    close(): void;
    /**
     * Transport was closed.
     */
    transportClosed(): void;
    private _handleDataChannel;
}
//# sourceMappingURL=DataConsumer.d.ts.map