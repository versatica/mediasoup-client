import EnhancedEventEmitter from './EnhancedEventEmitter';
import { RtpParameters } from './RtpParametersAndCapabilities';
export interface ProducerOptions {
    track?: MediaStreamTrack;
    encodings?: RTCRtpEncodingParameters[];
    codecOptions?: ProducerCodecOptions;
    appData?: object;
}
export interface ProducerCodecOptions {
    opusStereo?: boolean;
    opusFec?: boolean;
    opusDtx?: boolean;
    opusMaxPlaybackRate?: number;
    videoGoogleStartBitrate?: number;
    videoGoogleMaxBitrate?: number;
    videoGoogleMinBitrate?: number;
}
export declare class Producer extends EnhancedEventEmitter {
    private _id;
    private _localId;
    private _closed;
    private _track;
    private _rtpParameters;
    private _paused;
    private _maxSpatialLayer;
    private _appData;
    /**
     * @private
     *
     * @emits transportclose
     * @emits trackended
     * @emits {track: MediaStreamTrack} @replacetrack
     * @emits {spatialLayer: String} @setmaxspatiallayer
     * @emits @getstats
     * @emits @close
     */
    constructor({ id, localId, track, rtpParameters, appData }: {
        id: string;
        localId: string;
        track: MediaStreamTrack;
        rtpParameters: RtpParameters;
        appData: object;
    });
    /**
     * Producer id.
     */
    readonly id: string;
    /**
     * Local id.
     *
     * @private
     */
    readonly localId: string;
    /**
     * Whether the Producer is closed.
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
     * Whether the Producer is paused.
     */
    readonly paused: boolean;
    /**
     * Max spatial layer.
     *
     * @type {Number | undefined}
     */
    readonly maxSpatialLayer: number | undefined;
    /**
     * App custom data.
     */
    /**
    * Invalid setter.
    */
    appData: object;
    /**
     * Closes the Producer.
     */
    close(): void;
    /**
     * Transport was closed.
     *
     * @private
     */
    transportClosed(): void;
    /**
     * Get associated RTCRtpSender stats.
     *
     * @throws {InvalidStateError} if Producer closed.
     */
    getStats(): Promise<any>;
    /**
     * Pauses sending media.
     */
    pause(): void;
    /**
     * Resumes sending media.
     */
    resume(): void;
    /**
     * Replaces the current track with a new one.
     *
     * @throws {InvalidStateError} if Producer closed or track ended.
     * @throws {TypeError} if wrong arguments.
     */
    replaceTrack({ track }: {
        track: MediaStreamTrack;
    }): Promise<void>;
    /**
     * Sets the video max spatial layer to be sent.
     *
     * @throws {InvalidStateError} if Producer closed.
     * @throws {UnsupportedError} if not a video Producer.
     * @throws {TypeError} if wrong arguments.
     */
    setMaxSpatialLayer(spatialLayer: number): Promise<void>;
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
//# sourceMappingURL=Producer.d.ts.map