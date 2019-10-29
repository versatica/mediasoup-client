"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = __importDefault(require("./Logger"));
const EnhancedEventEmitter_1 = __importDefault(require("./EnhancedEventEmitter"));
const errors_1 = require("./errors");
const logger = new Logger_1.default('Producer');
class Producer extends EnhancedEventEmitter_1.default {
    /**
     * @emits transportclose
     * @emits trackended
     * @emits {track: MediaStreamTrack} @replacetrack
     * @emits {spatialLayer: String} @setmaxspatiallayer
     * @emits {Object} @setrtpencodingparameters
     * @emits @getstats
     * @emits @close
     */
    constructor({ id, localId, track, rtpParameters, appData }) {
        super(logger);
        // Closed flag.
        this._closed = false;
        this._id = id;
        this._localId = localId;
        this._track = track;
        this._rtpParameters = rtpParameters;
        this._paused = !track.enabled;
        this._maxSpatialLayer = undefined;
        this._appData = appData;
        this._onTrackEnded = this._onTrackEnded.bind(this);
        this._handleTrack();
    }
    /**
     * Producer id.
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
     * Whether the Producer is closed.
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
     * Whether the Producer is paused.
     */
    get paused() {
        return this._paused;
    }
    /**
     * Max spatial layer.
     *
     * @type {Number | undefined}
     */
    get maxSpatialLayer() {
        return this._maxSpatialLayer;
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
     * Closes the Producer.
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
     * Get associated RTCRtpSender stats.
     */
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            return this.safeEmitAsPromise('@getstats');
        });
    }
    /**
     * Pauses sending media.
     */
    pause() {
        logger.debug('pause()');
        if (this._closed) {
            logger.error('pause() | Producer closed');
            return;
        }
        this._paused = true;
        this._track.enabled = false;
    }
    /**
     * Resumes sending media.
     */
    resume() {
        logger.debug('resume()');
        if (this._closed) {
            logger.error('resume() | Producer closed');
            return;
        }
        this._paused = false;
        this._track.enabled = true;
    }
    /**
     * Replaces the current track with a new one.
     */
    replaceTrack({ track }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('replaceTrack() [track:%o]', track);
            if (this._closed) {
                // This must be done here. Otherwise there is no chance to stop the given
                // track.
                try {
                    track.stop();
                }
                catch (error) { }
                throw new errors_1.InvalidStateError('closed');
            }
            else if (!track) {
                throw new TypeError('missing track');
            }
            else if (track.readyState === 'ended') {
                throw new errors_1.InvalidStateError('track ended');
            }
            yield this.safeEmitAsPromise('@replacetrack', track);
            // Destroy the previous track.
            this._destroyTrack();
            // Set the new track.
            this._track = track;
            // If this Producer was paused/resumed and the state of the new
            // track does not match, fix it.
            if (!this._paused)
                this._track.enabled = true;
            else
                this._track.enabled = false;
            // Handle the effective track.
            this._handleTrack();
        });
    }
    /**
     * Sets the video max spatial layer to be sent.
     */
    setMaxSpatialLayer(spatialLayer) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            else if (this._track.kind !== 'video')
                throw new errors_1.UnsupportedError('not a video Producer');
            else if (typeof spatialLayer !== 'number')
                throw new TypeError('invalid spatialLayer');
            if (spatialLayer === this._maxSpatialLayer)
                return;
            yield this.safeEmitAsPromise('@setmaxspatiallayer', spatialLayer);
            this._maxSpatialLayer = spatialLayer;
        });
    }
    /**
     * Sets the DSCP value.
     */
    setRtpEncodingParameters(params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._closed)
                throw new errors_1.InvalidStateError('closed');
            else if (typeof params !== 'object')
                throw new TypeError('invalid params');
            yield this.safeEmitAsPromise('@setrtpencodingparameters', params);
        });
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
exports.default = Producer;
