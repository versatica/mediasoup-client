import EnhancedEventEmitter from './EnhancedEventEmitter';
import { SctpStreamParameters } from './SctpParameters';
export interface DataProducerOptions {
    ordered?: boolean;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    priority?: RTCPriorityType;
    label?: string;
    protocol?: string;
    appData?: any;
}
export default class DataProducer extends EnhancedEventEmitter {
    private readonly _id;
    private readonly _dataChannel;
    private _closed;
    private readonly _sctpStreamParameters;
    private readonly _appData;
    /**
     * @emits transportclose
     * @emits open
     * @emits {Object} error
     * @emits close
     * @emits bufferedamountlow
     * @emits @close
     */
    constructor({ id, dataChannel, sctpStreamParameters, appData }: {
        id: string;
        dataChannel: any;
        sctpStreamParameters: SctpStreamParameters;
        appData: any;
    });
    /**
     * DataProducer id.
     */
    readonly id: string;
    /**
     * Whether the DataProducer is closed.
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
     * DataChannel bufferedAmount.
     */
    readonly bufferedAmount: number;
    /**
     * DataChannel bufferedAmountLowThreshold.
     */
    /**
    * Set DataChannel bufferedAmountLowThreshold.
    */
    bufferedAmountLowThreshold: number;
    /**
     * App custom data.
     */
    /**
    * Invalid setter.
    */
    appData: any;
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