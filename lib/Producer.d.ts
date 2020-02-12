import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { RtpParameters } from './RtpParameters';
export declare type ProducerOptions = {
    track?: MediaStreamTrack;
    encodings?: RTCRtpEncodingParameters[];
    codecOptions?: ProducerCodecOptions;
    stopTracks?: boolean;
    appData?: any;
};
export declare type ProducerCodecOptions = {
    opusStereo?: boolean;
    opusFec?: boolean;
    opusDtx?: boolean;
    opusMaxPlaybackRate?: number;
    opusPtime?: number;
    videoGoogleStartBitrate?: number;
    videoGoogleMaxBitrate?: number;
    videoGoogleMinBitrate?: number;
};
export declare class Producer extends EnhancedEventEmitter {
    private readonly _id;
    private readonly _localId;
    private _closed;
    private readonly _rtpSender?;
    private _track;
    private readonly _rtpParameters;
    private _paused;
    private _maxSpatialLayer;
    private _stopTracks;
    private readonly _appData;
    /**
     * @emits transportclose
     * @emits trackended
     * @emits @replacetrack - (track: MediaStreamTrack)
     * @emits @setmaxspatiallayer - (spatialLayer: string)
     * @emits @setrtpencodingparameters - (params: any)
     * @emits @getstats
     * @emits @close
     */
    constructor({ id, localId, rtpSender, track, rtpParameters, stopTracks, appData }: {
        id: string;
        localId: string;
        rtpSender?: RTCRtpSender;
        track: MediaStreamTrack;
        rtpParameters: RtpParameters;
        stopTracks: boolean;
        appData: any;
    });
    /**
     * Producer id.
     */
    readonly id: string;
    /**
     * Local id.
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
     * Associated RTCRtpSender.
     */
    readonly rtpSender: RTCRtpSender | undefined;
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
    appData: any;
    /**
     * Closes the Producer.
     */
    close(): void;
    /**
     * Transport was closed.
     */
    transportClosed(): void;
    /**
     * Get associated RTCRtpSender stats.
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
     */
    replaceTrack({ track }: {
        track: MediaStreamTrack;
    }): Promise<void>;
    /**
     * Sets the video max spatial layer to be sent.
     */
    setMaxSpatialLayer(spatialLayer: number): Promise<void>;
    /**
     * Sets the DSCP value.
     */
    setRtpEncodingParameters(params: any): Promise<void>;
    private _onTrackEnded;
    private _handleTrack;
    private _destroyTrack;
}
//# sourceMappingURL=Producer.d.ts.map