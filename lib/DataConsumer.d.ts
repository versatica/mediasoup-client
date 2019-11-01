import EnhancedEventEmitter from './EnhancedEventEmitter';
import { SctpStreamParameters } from './SctpParameters';
export interface DataConsumerOptions {
    id?: string;
    dataProducerId?: string;
    sctpStreamParameters: SctpStreamParameters;
    label?: string;
    protocol?: string;
    appData?: any;
}
export default class DataConsumer extends EnhancedEventEmitter {
    private readonly _id;
    private readonly _dataProducerId;
    private readonly _dataChannel;
    private _closed;
    private readonly _sctpStreamParameters;
    private readonly _appData;
    /**
     * @emits transportclose
     * @emits open
     * @emits {Object} error
     * @emits close
     * @emits {Any} message
     * @emits @close
     */
    constructor({ id, dataProducerId, dataChannel, sctpStreamParameters, appData }: {
        id: string;
        dataProducerId: string;
        dataChannel: any;
        sctpStreamParameters: SctpStreamParameters;
        appData: any;
    });
    /**
     * DataConsumer id.
     */
    readonly id: string;
    /**
     * Associated DataProducer id.
     */
    readonly dataProducerId: string;
    /**
     * Whether the DataConsumer is closed.
     */
    readonly closed: boolean;
    /**
     * SCTP stream parameters.
     */
    readonly sctpStreamParameters: SctpStreamParameters;
    /**
     * DataChannel readyState.
     */
    readonly readyState: RTCDataChannelState;
    /**
     * DataChannel label.
     */
    readonly label: string;
    /**
     * DataChannel protocol.
     */
    readonly protocol: string;
    /**
     * DataChannel binaryType.
     */
    /**
    * Set DataChannel binaryType.
    */
    binaryType: string;
    /**
     * App custom data.
     */
    /**
    * Invalid setter.
    */
    appData: any;
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