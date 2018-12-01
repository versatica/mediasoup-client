import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';

const SIMULCAST_DEFAULT =
{
	low    : 100000,
	medium : 300000,
	high   : 1500000
};

const logger = new Logger('Producer');

export default class Producer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits transportclose
	 * @emits trackended
	 * @emits {track: MediaStreamTrack} @replacetrack
	 * @emits @close
	 */
	constructor({ track, simulcast, appData })
	{
		super(logger);

		// Id.
		// @type {String}
		this._id = null;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Track cloned from the original one (if supported).
		// @type {MediaStreamTrack}
		try
		{
			this._track = track.clone();
		}
		catch (error)
		{
			this._track = track;
		}

		// Original track.
		// @type {MediaStreamTrack}
		this._originalTrack = track;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = null;

		// Paused flag.
		// @type {Boolean}
		this._paused = false;

		// Simulcast.
		// @type {Object|false}
		this._simulcast = false;

		if (typeof simulcast === 'object')
			this._simulcast = Object.assign({}, SIMULCAST_DEFAULT, simulcast);
		else if (simulcast === true)
			this._simulcast = Object.assign({}, SIMULCAST_DEFAULT);

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Handle the effective track.
		this._handleTrack();
	}

	/**
	 * Producer id.
	 *
	 * @return {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Set id.
	 *
	 * @private
	 *
	 * @param {String} id
	 */
	set id(id)
	{
		this._id = id;
	}

	/**
	 * Whether the producer is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * Media kind.
	 *
	 * @return {String}
	 */
	get kind()
	{
		return this._track.kind;
	}

	/**
	 * The associated track.
	 *
	 * @return {MediaStreamTrack}
	 */
	get track()
	{
		return this._track;
	}

	/**
	 * The associated original track.
	 *
	 * @return {MediaStreamTrack}
	 */
	get originalTrack()
	{
		return this._originalTrack;
	}

	/**
	 * RTP parameters.
	 *
	 * @return {RTCRtpParameters}
	 */
	get rtpParameters()
	{
		return this._rtpParameters;
	}

	/**
	 * Set/update RTP parameters.
	 *
	 * @private
	 *
	 * @param {RTCRtpParameters} rtpParameters
	 */
	set rtpParameters(rtpParameters)
	{
		this._rtpParameters = rtpParameters;
	}

	/**
	 * Whether the producer is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._paused;
	}

	/**
	 * Simulcast settings.
	 *
	 * @return {Object|false}
	 */
	get simulcast()
	{
		return this._simulcast;
	}

	/**
	 * App custom data.
	 *
	 * @return {Any}
	 */
	get appData()
	{
		return this._appData;
	}

	/**
	 * Closes the producer.
	 */
	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		this._destroyTrack();

		this.emit('@close');
	}

	/**
	 * Transport was closed.
	 *
	 * @private
	 */
	transportClosed()
	{
		if (this._closed)
			return;

		this._closed = true;

		this._destroyTrack();

		this.safeEmit('transportclose');
	}

	/**
	 * Pauses sending media.
	 */
	pause()
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | producer closed');

			return;
		}

		this._paused = true;
		this._track.enabled = false;
	}

	/**
	 * Resumes sending media.
	 */
	resume()
	{
		logger.debug('resume()');

		if (this._closed)
		{
			logger.error('resume() | producer closed');

			return;
		}

		this._paused = false;
		this._track.enabled = true;
	}

	/**
	 * Replaces the current track with a new one.
	 *
	 * @param {MediaStreamTrack} track - New track.
	 *
	 * @return {Promise} Resolves with the new track itself.
	 */
	replaceTrack(track)
	{
		logger.debug('replaceTrack() [track:%o]', track);

		if (this._closed)
			return Promise.reject(new InvalidStateError('producer closed'));
		else if (!track)
			return Promise.reject(new TypeError('missing track'));

		let clonedTrack;

		try
		{
			clonedTrack = track.clone();
		}
		catch (error)
		{
			clonedTrack = track;
		}

		return Promise.resolve()
			.then(() =>
			{
				return this.safeEmitAsPromise('@replacetrack', clonedTrack);
			})
			.then(() =>
			{
				// Destroy the previous track.
				this._destroyTrack();

				// If this Producer was locally paused/resumed and the state of the new
				// track does not match, fix it.
				if (!this._paused)
					clonedTrack.enabled = true;
				else
					clonedTrack.enabled = false;

				// Set the new tracks.
				this._originalTrack = track;
				this._track = clonedTrack;

				// Handle the effective track.
				this._handleTrack();

				// Return the new track.
				return this._track;
			});
	}

	/**
	 * @private
	 */
	_handleTrack()
	{
		this._track.onended = () =>
		{
			if (this._closed)
				return;

			logger.warn('track "ended" event');

			this.safeEmit('trackended');
		};
	}

	/**
	 * @private
	 */
	_destroyTrack()
	{
		try
		{
			if (this._track !== this._originalTrack)
			{
				this._track.onended = null;
				this._track.stop();
			}
		}
		catch (error)
		{}
	}
}
