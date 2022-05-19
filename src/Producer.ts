import { Logger } from './Logger';
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import {
	MediaKind,
	RtpCodecCapability,
	RtpParameters,
	RtpEncodingParameters
} from './RtpParameters';

export type ProducerOptions =
{
	track?: MediaStreamTrack;
	encodings?: RtpEncodingParameters[];
	codecOptions?: ProducerCodecOptions;
	codec?: RtpCodecCapability;
	stopTracks?: boolean;
	disableTrackOnPause?: boolean;
	zeroRtpOnPause?: boolean;
	appData?: Record<string, unknown>;
}

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
export type ProducerCodecOptions =
{
	opusStereo?: boolean;
	opusFec?: boolean;
	opusDtx?: boolean;
	opusMaxPlaybackRate?: number;
	opusMaxAverageBitrate?: number;
	opusPtime?: number;
	videoGoogleStartBitrate?: number;
	videoGoogleMaxBitrate?: number;
	videoGoogleMinBitrate?: number;
}

const logger = new Logger('Producer');

export class Producer extends EnhancedEventEmitter
{
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
	private readonly _appData: Record<string, unknown>;
	// Observer instance.
	protected readonly _observer = new EnhancedEventEmitter();

	/**
	 * @emits transportclose
	 * @emits trackended
	 * @emits @replacetrack - (track: MediaStreamTrack | null)
	 * @emits @setmaxspatiallayer - (spatialLayer: string)
	 * @emits @setrtpencodingparameters - (params: any)
	 * @emits @getstats
	 * @emits @close
	 */
	constructor(
		{
			id,
			localId,
			rtpSender,
			track,
			rtpParameters,
			stopTracks,
			disableTrackOnPause,
			zeroRtpOnPause,
			appData
		}:
		{
			id: string;
			localId: string;
			rtpSender?: RTCRtpSender;
			track: MediaStreamTrack;
			rtpParameters: RtpParameters;
			stopTracks: boolean;
			disableTrackOnPause: boolean;
			zeroRtpOnPause: boolean;
			appData?: Record<string, unknown>;
		}
	)
	{
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
		this._appData = appData || {};
		this._onTrackEnded = this._onTrackEnded.bind(this);

		// NOTE: Minor issue. If zeroRtpOnPause is true, we cannot emit the
		// '@replacetrack' event here, so RTCRtpSender.track won't be null.

		this._handleTrack();
	}

	/**
	 * Producer id.
	 */
	get id(): string
	{
		return this._id;
	}

	/**
	 * Local id.
	 */
	get localId(): string
	{
		return this._localId;
	}

	/**
	 * Whether the Producer is closed.
	 */
	get closed(): boolean
	{
		return this._closed;
	}

	/**
	 * Media kind.
	 */
	get kind(): MediaKind
	{
		return this._kind;
	}

	/**
	 * Associated RTCRtpSender.
	 */
	get rtpSender(): RTCRtpSender | undefined
	{
		return this._rtpSender;
	}

	/**
	 * The associated track.
	 */
	get track(): MediaStreamTrack | null
	{
		return this._track;
	}

	/**
	 * RTP parameters.
	 */
	get rtpParameters(): RtpParameters
	{
		return this._rtpParameters;
	}

	/**
	 * Whether the Producer is paused.
	 */
	get paused(): boolean
	{
		return this._paused;
	}

	/**
	 * Max spatial layer.
	 *
	 * @type {Number | undefined}
	 */
	get maxSpatialLayer(): number | undefined
	{
		return this._maxSpatialLayer;
	}

	/**
	 * App custom data.
	 */
	get appData(): Record<string, unknown>
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	set appData(appData: Record<string, unknown>)
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Observer.
	 *
	 * @emits close
	 * @emits pause
	 * @emits resume
	 * @emits trackended
	 */
	get observer(): EnhancedEventEmitter
	{
		return this._observer;
	}

	/**
	 * Closes the Producer.
	 */
	close(): void
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;

		this._destroyTrack();

		this.emit('@close');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Transport was closed.
	 */
	transportClosed(): void
	{
		if (this._closed)
			return;

		logger.debug('transportClosed()');

		this._closed = true;

		this._destroyTrack();

		this.safeEmit('transportclose');

		// Emit observer event.
		this._observer.safeEmit('close');
	}

	/**
	 * Get associated RTCRtpSender stats.
	 */
	async getStats(): Promise<RTCStatsReport>
	{
		if (this._closed)
			throw new InvalidStateError('closed');

		return this.safeEmitAsPromise('@getstats');
	}

	/**
	 * Pauses sending media.
	 */
	pause(): void
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | Producer closed');

			return;
		}

		this._paused = true;

		if (this._track && this._disableTrackOnPause)
		{
			this._track.enabled = false;
		}

		if (this._zeroRtpOnPause)
		{
			this.safeEmitAsPromise('@replacetrack', null)
				.catch(() => {});
		}

		// Emit observer event.
		this._observer.safeEmit('pause');
	}

	/**
	 * Resumes sending media.
	 */
	resume(): void
	{
		logger.debug('resume()');

		if (this._closed)
		{
			logger.error('resume() | Producer closed');

			return;
		}

		this._paused = false;

		if (this._track && this._disableTrackOnPause)
		{
			this._track.enabled = true;
		}

		if (this._zeroRtpOnPause)
		{
			this.safeEmitAsPromise('@replacetrack', this._track)
				.catch(() => {});
		}

		// Emit observer event.
		this._observer.safeEmit('resume');
	}

	/**
	 * Replaces the current track with a new one or null.
	 */
	async replaceTrack({ track }: { track: MediaStreamTrack | null }): Promise<void>
	{
		logger.debug('replaceTrack() [track:%o]', track);

		if (this._closed)
		{
			// This must be done here. Otherwise there is no chance to stop the given
			// track.
			if (track && this._stopTracks)
			{
				try { track.stop(); }
				catch (error) {}
			}

			throw new InvalidStateError('closed');
		}
		else if (track && track.readyState === 'ended')
		{
			throw new InvalidStateError('track ended');
		}

		// Do nothing if this is the same track as the current handled one.
		if (track === this._track)
		{
			logger.debug('replaceTrack() | same track, ignored');

			return;
		}

		if (!this._zeroRtpOnPause || !this._paused)
		{
			await this.safeEmitAsPromise('@replacetrack', track);
		}

		// Destroy the previous track.
		this._destroyTrack();

		// Set the new track.
		this._track = track;

		// If this Producer was paused/resumed and the state of the new
		// track does not match, fix it.
		if (this._track && this._disableTrackOnPause)
		{
			if (!this._paused)
				this._track.enabled = true;
			else if (this._paused)
				this._track.enabled = false;
		}

		// Handle the effective track.
		this._handleTrack();
	}

	/**
	 * Sets the video max spatial layer to be sent.
	 */
	async setMaxSpatialLayer(spatialLayer: number): Promise<void>
	{
		if (this._closed)
			throw new InvalidStateError('closed');
		else if (this._kind !== 'video')
			throw new UnsupportedError('not a video Producer');
		else if (typeof spatialLayer !== 'number')
			throw new TypeError('invalid spatialLayer');

		if (spatialLayer === this._maxSpatialLayer)
			return;

		await this.safeEmitAsPromise('@setmaxspatiallayer', spatialLayer);

		this._maxSpatialLayer = spatialLayer;
	}

	/**
	 * Sets the DSCP value.
	 */
	async setRtpEncodingParameters(
		params: RTCRtpEncodingParameters
	): Promise<void>
	{
		if (this._closed)
			throw new InvalidStateError('closed');
		else if (typeof params !== 'object')
			throw new TypeError('invalid params');

		await this.safeEmitAsPromise('@setrtpencodingparameters', params);
	}

	private _onTrackEnded(): void
	{
		logger.debug('track "ended" event');

		this.safeEmit('trackended');

		// Emit observer event.
		this._observer.safeEmit('trackended');
	}

	private _handleTrack(): void
	{
		if (!this._track)
			return;

		this._track.addEventListener('ended', this._onTrackEnded);
	}

	private _destroyTrack(): void
	{
		if (!this._track)
			return;

		try
		{
			this._track.removeEventListener('ended', this._onTrackEnded);

			// Just stop the track unless the app set stopTracks: false.
			if (this._stopTracks)
				this._track.stop();
		}
		catch (error)
		{}
	}
}
