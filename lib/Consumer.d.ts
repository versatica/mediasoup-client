import EnhancedEventEmitter from './EnhancedEventEmitter';
import { RtpParameters } from './RtpParametersAndCapabilities';
export interface ConsumerOptions {
    id?: string;
    producerId?: string;
    kind?: 'audio' | 'video';
    rtpParameters?: RtpParameters;
    appData?: object;
}
export declare class Consumer extends EnhancedEventEmitter {
    private _id;
    private _localId;
    private _producerId;
    private _closed;
    private _track;
    private _rtpParameters;
    private _paused;
    private _appData;
    /**
     * @private
     *
     * @emits transportclose
     * @emits trackended
     * @emits @getstats
     * @emits @close
     */
    constructor({ id, localId, producerId, track, rtpParameters, appData }: {
        id: string;
        localId: string;
        producerId: string;
        track: MediaStreamTrack;
        rtpParameters: RtpParameters;
        appData: object;
    });
    /**
     * Consumer id.
     */
    readonly id: string;
    /**
     * Local id.
     *
     * @private
     */
    readonly localId: string;
    /**
     * Associated Producer id.
     */
    readonly producerId: string;
    /**
     * Whether the Consumer is closed.
     */
    readonly closed: boolean;
    /**
     * Media kind.
     */
    readonly kind: string;
    /**
     * The associated track.
     */
    readonly track: MediaStreamTrack;
    /**
     * RTP parameters.
     */
    readonly rtpParameters: RtpParameters;
    /**
     * Whether the Consumer is paused.
     */
    readonly paused: boolean;
    /**
     * App custom data.
     */
    /**
    * Invalid setter.
    */
    appData: object;
    /**
     * Closes the Consumer.
     */
    close(): void;
    /**
     * Transport was closed.
     *
     * @private
     */
    transportClosed(): void;
    /**
     * Get associated RTCRtpReceiver stats.
     *
     * @throws {InvalidStateError} if Consumer closed.
     */
    getStats(): Promise<any>;
    /**
     * Pauses receiving media.
     */
    pause(): void;
    /**
     * Resumes receiving media.
     */
    resume(): void;
    /**
     * @private
     */
    _onTrackEnded(): void;
    /**
     * @private
     */
    _handleTrack(): void;
    /**
     * @private
     */
    _destroyTrack(): void;
}
//# sourceMappingURL=Consumer.d.ts.map