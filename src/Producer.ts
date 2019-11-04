import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import { RtpParameters } from './RtpParameters';

export interface ProducerOptions {
	track?: MediaStreamTrack;
	encodings?: RTCRtpEncodingParameters[];
	codecOptions?: ProducerCodecOptions;
	appData?: any;
}

// https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
export interface ProducerCodecOptions {
	opusStereo?: boolean;
	opusFec?: boolean;
	opusDtx?: boolean;
	opusMaxPlaybackRate?: number;
	videoGoogleStartBitrate?: number;
	videoGoogleMaxBitrate?: number;
	videoGoogleMinBitrate?: number;
}

const logger = new Logger('Producer');

export default class Producer extends EnhancedEventEmitter
{
	// Id.
	private readonly _id: string;

	// Local id.
	private readonly _localId: string;

	// Closed flag.
	private _closed = false;

	// Local track.
	private _track: MediaStreamTrack;

	// RTP parameters.
	private readonly _rtpParameters: RtpParameters;

	// Paused flag.
	private _paused: boolean;

	// Video max spatial layer.
	private _maxSpatialLayer: number | undefined;

	// App custom data.
	private readonly _appData: any;

	/**
	 * @emits transportclose
	 * @emits trackended
	 * @emits {track: MediaStreamTrack} @replacetrack
	 * @emits {spatialLayer: String} @setmaxspatiallayer
	 * @emits {Object} @setrtpencodingparameters
	 * @emits @getstats
	 * @emits @close
	 */
	constructor(
		{
			id,
			localId,
			track,
			rtpParameters,
			appData
		}:
		{
			id: string;
			localId: string;
			track: MediaStreamTrack;
			rtpParameters: RtpParameters;
			appData: any;
		}
	)
	{
		super(logger);

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
	get kind(): string
	{
		return this._track.kind;
	}

	/**
	 * The associated track.
	 */
	get track(): MediaStreamTrack
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
	get appData(): any
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	set appData(appData) // eslint-disable-line @typescript-eslint/no-unused-vars
	{
		throw new Error('cannot override appData object');
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
	}

	/**
	 * Get associated RTCRtpSender stats.
	 */
	async getStats(): Promise<any>
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
		this._track.enabled = false;
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
		this._track.enabled = true;
	}

	/**
	 * Replaces the current track with a new one.
	 */
	async replaceTrack({ track }: { track: MediaStreamTrack }): Promise<void>
	{
		logger.debug('replaceTrack() [track:%o]', track);

		if (this._closed)
		{
			// This must be done here. Otherwise there is no chance to stop the given
			// track.
			try { track.stop(); }
			catch (error) {}

			throw new InvalidStateError('closed');
		}
		else if (!track)
		{
			throw new TypeError('missing track');
		}
		else if (track.readyState === 'ended')
		{
			throw new InvalidStateError('track ended');
		}

		await this.safeEmitAsPromise('@replacetrack', track);

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
	}

	/**
	 * Sets the video max spatial layer to be sent.
	 */
	async setMaxSpatialLayer(spatialLayer: number): Promise<void>
	{
		if (this._closed)
			throw new InvalidStateError('closed');
		else if (this._track.kind !== 'video')
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
	async setRtpEncodingParameters(params: any): Promise<void>
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
	}

	private _handleTrack(): void
	{
		this._track.addEventListener('ended', this._onTrackEnded);
	}

	private _destroyTrack(): void
	{
		try
		{
			this._track.removeEventListener('ended', this._onTrackEnded);
			this._track.stop();
		}
		catch (error)
		{}
	}
}
