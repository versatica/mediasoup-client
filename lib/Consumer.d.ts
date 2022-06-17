import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { MediaKind, RtpParameters } from './RtpParameters';
export declare type ConsumerOptions = {
    id?: string;
    producerId?: string;
    kind?: 'audio' | 'video';
    rtpParameters: RtpParameters;
    appData?: Record<string, unknown>;
};
export declare class Consumer extends EnhancedEventEmitter {
    private readonly _id;
    private readonly _localId;
    private readonly _producerId;
    private _closed;
    private readonly _rtpReceiver?;
    private readonly _track;
    private readonly _rtpParameters;
    private _paused;
    private readonly _appData;
    protected readonly _observer: EnhancedEventEmitter;
    /**
     * @emits transportclose
     * @emits trackended
     * @emits @getstats
     * @emits @close
     * @emits @pause
     * @emits @resume
     */
    constructor({ id, localId, producerId, rtpReceiver, track, rtpParameters, appData }: {
        id: string;
        localId: string;
        producerId: string;
        rtpReceiver?: RTCRtpReceiver;
        track: MediaStreamTrack;
        rtpParameters: RtpParameters;
        appData?: Record<string, unknown>;
    });
    /**
     * Consumer id.
     */
    get id(): string;
    /**
     * Local id.
     */
    get localId(): string;
    /**
     * Associated Producer id.
     */
    get producerId(): string;
    /**
     * Whether the Consumer is closed.
     */
    get closed(): boolean;
    /**
     * Media kind.
     */
    get kind(): MediaKind;
    /**
     * Associated RTCRtpReceiver.
     */
    get rtpReceiver(): RTCRtpReceiver | undefined;
    /**
     * The associated track.
     */
    get track(): MediaStreamTrack;
    /**
     * RTP parameters.
     */
    get rtpParameters(): RtpParameters;
    /**
     * Whether the Consumer is paused.
     */
    get paused(): boolean;
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
     * @emits pause
     * @emits resume
     * @emits trackended
     */
    get observer(): EnhancedEventEmitter;
    /**
     * Closes the Consumer.
     */
    close(): void;
    /**
     * Transport was closed.
     */
    transportClosed(): void;
    /**
     * Get associated RTCRtpReceiver stats.
     */
    getStats(): Promise<RTCStatsReport>;
    /**
     * Pauses receiving media.
     */
    pause(): void;
    /**
     * Resumes receiving media.
     */
    resume(): void;
    private _onTrackEnded;
    private _handleTrack;
    private _destroyTrack;
}
//# sourceMappingURL=Consumer.d.ts.map