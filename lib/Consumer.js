"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = require("./Logger");
const EnhancedEventEmitter_1 = require("./EnhancedEventEmitter");
const errors_1 = require("./errors");
const logger = new Logger_1.Logger('Consumer');
class Consumer extends EnhancedEventEmitter_1.EnhancedEventEmitter {
    /**
     * @emits transportclose
     * @emits trackended
     * @emits @getstats
     * @emits @close
     */
    constructor({ id, localId, producerId, rtpReceiver, track, rtpParameters, appData }) {
        super();
        // Closed flag.
        this._closed = false;
        logger.debug('constructor()');
        this._id = id;
        this._localId = localId;
        this._producerId = producerId;
        this._rtpReceiver = rtpReceiver;
        this._track = track;
        this._rtpParameters = rtpParameters;
        this._paused = !track.enabled;
        this._appData = appData;
        this._onTrackEnded = this._onTrackEnded.bind(this);
        this._handleTrack();
    }
    /**
     * Consumer id.
     */
    get id() {
        return this._id;
    }
    /**
     * Local id.
     */
    get localId() {
        return this._localId;
    }
    /**
     * Associated Producer id.
     */
    get producerId() {
        return this._producerId;
    }
    /**
     * Whether the Consumer is closed.
     */
    get closed() {
        return this._closed;
    }
    /**
     * Media kind.
     */
    get kind() {
        return this._track.kind;
    }
    /**
     * Associated RTCRtpReceiver.
     */
    get rtpReceiver() {
        return this._rtpReceiver;
    }
    /**
     * The associated track.
     */
    get track() {
        return this._track;
    }
    /**
     * RTP parameters.
     */
    get rtpParameters() {
        return this._rtpParameters;
    }
    /**
     * Whether the Consumer is paused.
     */
    get paused() {
        return this._paused;
    }
    /**
     * App custom data.
     */
    get appData() {
        return this._appData;
    }
    /**
     * Invalid setter.
     */
    set appData(appData) {
        throw new Error('cannot override appData object');
    }
    /**
     * Closes the Consumer.
     */
    close() {
        if (this._closed)
            return;
        logger.debug('close()');
        this._closed = true;
        this._destroyTrack();
        this.emit('@close');
    }
    /**
     * Transport was closed.
     */
    transportClosed() {
        if (this._closed)
            return;
        logger.debug('transportClosed()');
        this._closed = true;
        this._destroyTrack();
        this.safeEmit('transportclose');
    }
    /**
     * Get associated RTCRtpReceiver stats.
     */
    async getStats() {
        if (this._closed)
            throw new errors_1.InvalidStateError('closed');
        return this.safeEmitAsPromise('@getstats');
    }
    /**
     * Pauses receiving media.
     */
    pause() {
        logger.debug('pause()');
        if (this._closed) {
            logger.error('pause() | Consumer closed');
            return;
        }
        this._paused = true;
        this._track.enabled = false;
    }
    /**
     * Resumes receiving media.
     */
    resume() {
        logger.debug('resume()');
        if (this._closed) {
            logger.error('resume() | Consumer closed');
            return;
        }
        this._paused = false;
        this._track.enabled = true;
    }
    _onTrackEnded() {
        logger.debug('track "ended" event');
        this.safeEmit('trackended');
    }
    _handleTrack() {
        this._track.addEventListener('ended', this._onTrackEnded);
    }
    _destroyTrack() {
        try {
            this._track.removeEventListener('ended', this._onTrackEnded);
            this._track.stop();
        }
        catch (error) { }
    }
}
exports.Consumer = Consumer;
