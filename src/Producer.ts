import { Logger } from './Logger';
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import {
	MediaKind,
	RtpCodecCapability,
	RtpParameters,
	RtpEncodingParameters,
} from './RtpParameters';
import { AppData } from './types';

const logger = new Logger('Producer');

export type ProducerOptions<ProducerAppData extends AppData = AppData> = {
	track?: MediaStreamTrack;
	encodings?: RtpEncodingParameters[];
	codecOptions?: ProducerCodecOptions;
	codec?: RtpCodecCapability;
	stopTracks?: boolean;
	disableTrackOnPause?: boolean;
	zeroRtpOnPause?: boolean;
	onRtpSender?: OnRtpSenderCallback;
	appData?: ProducerAppData;
};

/**
 * Invoked synchronously immediately after a new RTCRtpSender is created.
 * This allows for creating encoded streams in chromium browsers.
 */
export type OnRtpSenderCallback = (rtpSender: RTCRtpSender) => void;

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
export type ProducerCodecOptions = {
	opusStereo?: boolean;
	opusFec?: boolean;
	opusDtx?: boolean;
	opusMaxPlaybackRate?: number;
	opusMaxAverageBitrate?: number;
	opusPtime?: number;
	opusNack?: boolean;
	videoGoogleStartBitrate?: number;
	videoGoogleMaxBitrate?: number;
	videoGoogleMinBitrate?: number;
};

export type ProducerEvents = {
	transportclose: [];
	trackended: [];
	// Private events.
	'@pause': [() => void, (error: Error) => void];
	'@resume': [() => void, (error: Error) => void];
	'@replacetrack': [
		MediaStreamTrack | null,
		() => void,
		(error: Error) => void,
	];
	'@setmaxspatiallayer': [number, () => void, (error: Error) => void];
	'@setrtpencodingparameters': [
		RTCRtpEncodingParameters,
		() => void,
		(error: Error) => void,
	];
	'@getstats': [(stats: RTCStatsReport) => void, (error: Error) => void];
	'@close': [];
};

export type ProducerObserverEvents = {
	close: [];
	pause: [];
	resume: [];
	trackended: [];
};

export class Producer<
	ProducerAppData extends AppData = AppData,
> extends EnhancedEventEmitter<ProducerEvents> {
	// Id.
	private readonly _id: string;
	// Local id.
	private readonly _localId: string;
	// Closed flag.
	private _closed = false;
	// Associated RTCRtpSender.
	private readonly _rtpSender?: RTCRtpSender;
	// Local track.
	private _track: MediaStreamTrack | null;
	// Producer kind.
	private readonly _kind: MediaKind;
	// RTP parameters.
	private readonly _rtpParameters: RtpParameters;
	// Paused flag.
	private _paused: boolean;
	// Video max spatial layer.
	private _maxSpatialLayer: number | undefined;
	// Whether the Producer should call stop() in given tracks.
	private _stopTracks: boolean;
	// Whether the Producer should set track.enabled = false when paused.
	private _disableTrackOnPause: boolean;
	// Whether we should replace the RTCRtpSender.track with null when paused.
	private _zeroRtpOnPause: boolean;
	// App custom data.
	private _appData: ProducerAppData;
	// Observer instance.
	protected readonly _observer =
		new EnhancedEventEmitter<ProducerObserverEvents>();

	constructor({
		id,
		localId,
		rtpSender,
		track,
		rtpParameters,
		stopTracks,
		disableTrackOnPause,
		zeroRtpOnPause,
		appData,
	}: {
		id: string;
		localId: string;
		rtpSender?: RTCRtpSender;
		track: MediaStreamTrack;
		rtpParameters: RtpParameters;
		stopTracks: boolean;
		disableTrackOnPause: boolean;
		zeroRtpOnPause: boolean;
		appData?: ProducerAppData;
	}) {
		super();

		logger.debug('constructor()');

		this._id = id;
		this._localId = localId;
		this._rtpSender = rtpSender;
		this._track = track;
		this._kind = track.kind as MediaKind;
		this._rtpParameters = rtpParameters;
		this._paused = disableTrackOnPause ? !track.enabled : false;
		this._maxSpatialLayer = undefined;
		this._stopTracks = stopTracks;
		this._disableTrackOnPause = disableTrackOnPause;
		this._zeroRtpOnPause = zeroRtpOnPause;
		this._appData = appData || ({} as ProducerAppData);
		this.onTrackEnded = this.onTrackEnded.bind(this);

		// NOTE: Minor issue. If zeroRtpOnPause is true, we cannot emit the
		// '@replacetrack' event here, so RTCRtpSender.track won't be null.

		this.handleTrack();
	}

	/**
	 * Producer id.
	 */
	get id(): string {
		return this._id;
	}

	/**
	 * Local id.
	 */
	get localId(): string {
		return this._localId;
	}

	/**
	 * Whether the Producer is closed.
	 */
	get closed(): boolean {
		return this._closed;
	}

	/**
	 * Media kind.
	 */
	get kind(): MediaKind {
		return this._kind;
	}

	/**
	 * Associated RTCRtpSender.
	 */
	get rtpSender(): RTCRtpSender | undefined {
		return this._rtpSender;
	}

	/**
	 * The associated track.
	 */
	get track(): MediaStreamTrack | null {
		return this._track;
	}

	/**
	 * RTP parameters.
	 */
	get rtpParameters(): RtpParameters {
		return this._rtpParameters;
	}

	/**
	 * Whether the Producer is paused.
	 */
	get paused(): boolean {
		return this._paused;
	}

	/**
	 * Max spatial layer.
	 *
	 * @type {Number | undefined}
	 */
	get maxSpatialLayer(): number | undefined {
		return this._maxSpatialLayer;
	}

	/**
	 * App custom data.
	 */
	get appData(): ProducerAppData {
		return this._appData;
	}

	/**
	 * App custom data setter.
	 */
	set appData(appData: ProducerAppData) {
		this._appData = appData;
	}

	get observer(): EnhancedEventEmitter {
		return this._observer;
	}

	/**
	 * Closes the Producer.
	 */
	close(): void {
		if (this._closed) {
			return;
		}

		logger.debug('close()');

		this._closed = true;

		this.destroyTrack();

		this.emit('@close');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Transport was closed.
	 */
	transportClosed(): void {
		if (this._closed) {
			return;
		}

		logger.debug('transportClosed()');

		this._closed = true;

		this.destroyTrack();

		this.safeEmit('transportclose');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Get associated RTCRtpSender stats.
	 */
	async getStats(): Promise<RTCStatsReport> {
		if (this._closed) {
			throw new InvalidStateError('closed');
		}

		return new Promise<RTCStatsReport>((resolve, reject) => {
			this.safeEmit('@getstats', resolve, reject);
		});
	}

	/**
	 * Pauses sending media.
	 */
	pause(): void {
		logger.debug('pause()');

		if (this._closed) {
			logger.error('pause() | Producer closed');

			return;
		}

		this._paused = true;

		if (this._track && this._disableTrackOnPause) {
			this._track.enabled = false;
		}

		if (this._zeroRtpOnPause) {
			new Promise<void>((resolve, reject) => {
				this.safeEmit('@pause', resolve, reject);
			}).catch(() => {});
		}

		// Emit observer event.
		this._observer.safeEmit('pause');
	}

	/**
	 * Resumes sending media.
	 */
	resume(): void {
		logger.debug('resume()');

		if (this._closed) {
			logger.error('resume() | Producer closed');

			return;
		}

		this._paused = false;

		if (this._track && this._disableTrackOnPause) {
			this._track.enabled = true;
		}

		if (this._zeroRtpOnPause) {
			new Promise<void>((resolve, reject) => {
				this.safeEmit('@resume', resolve, reject);
			}).catch(() => {});
		}

		// Emit observer event.
		this._observer.safeEmit('resume');
	}

	/**
	 * Replaces the current track with a new one or null.
	 */
	async replaceTrack({
		track,
	}: {
		track: MediaStreamTrack | null;
	}): Promise<void> {
		logger.debug('replaceTrack() [track:%o]', track);

		if (this._closed) {
			// This must be done here. Otherwise there is no chance to stop the given
			// track.
			if (track && this._stopTracks) {
				try {
					track.stop();
				} catch (error) {}
			}

			throw new InvalidStateError('closed');
		} else if (track && track.readyState === 'ended') {
			throw new InvalidStateError('track ended');
		}

		// Do nothing if this is the same track as the current handled one.
		if (track === this._track) {
			logger.debug('replaceTrack() | same track, ignored');

			return;
		}

		await new Promise<void>((resolve, reject) => {
			this.safeEmit('@replacetrack', track, resolve, reject);
		});

		// Destroy the previous track.
		this.destroyTrack();

		// Set the new track.
		this._track = track;

		// If this Producer was paused/resumed and the state of the new
		// track does not match, fix it.
		if (this._track && this._disableTrackOnPause) {
			if (!this._paused) {
				this._track.enabled = true;
			} else if (this._paused) {
				this._track.enabled = false;
			}
		}

		// Handle the effective track.
		this.handleTrack();
	}

	/**
	 * Sets the video max spatial layer to be sent.
	 */
	async setMaxSpatialLayer(spatialLayer: number): Promise<void> {
		if (this._closed) {
			throw new InvalidStateError('closed');
		} else if (this._kind !== 'video') {
			throw new UnsupportedError('not a video Producer');
		} else if (typeof spatialLayer !== 'number') {
			throw new TypeError('invalid spatialLayer');
		}

		if (spatialLayer === this._maxSpatialLayer) {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			this.safeEmit('@setmaxspatiallayer', spatialLayer, resolve, reject);
		}).catch(() => {});

		this._maxSpatialLayer = spatialLayer;
	}

	async setRtpEncodingParameters(
		params: RTCRtpEncodingParameters
	): Promise<void> {
		if (this._closed) {
			throw new InvalidStateError('closed');
		} else if (typeof params !== 'object') {
			throw new TypeError('invalid params');
		}

		await new Promise<void>((resolve, reject) => {
			this.safeEmit('@setrtpencodingparameters', params, resolve, reject);
		});
	}

	private onTrackEnded(): void {
		logger.debug('track "ended" event');

		this.safeEmit('trackended');

		// Emit observer event.
		this._observer.safeEmit('trackended');
	}

	private handleTrack(): void {
		if (!this._track) {
			return;
		}

		this._track.addEventListener('ended', this.onTrackEnded);
	}

	private destroyTrack(): void {
		if (!this._track) {
			return;
		}

		try {
			this._track.removeEventListener('ended', this.onTrackEnded);

			// Just stop the track unless the app set stopTracks: false.
			if (this._stopTracks) {
				this._track.stop();
			}
		} catch (error) {}
	}
}
