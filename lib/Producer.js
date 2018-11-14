import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';
import * as utils from './utils';

const DEFAULT_STATS_INTERVAL = 1000;
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
	 * @emits {originator: String, [appData]: Any} pause
	 * @emits {originator: String, [appData]: Any} resume
	 * @emits {stats: Object} stats
	 * @emits handled
	 * @emits unhandled
	 * @emits trackended
	 * @emits {originator: String, [appData]: Any} close
	 *
	 * @emits {originator: String, [appData]: Any} @close
	 */
	constructor(track, options, appData)
	{
		super(logger);

		// Id.
		// @type {Number}
		this._id = utils.randomNumber();

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Original track.
		// @type {MediaStreamTrack}
		this._originalTrack = track;

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

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Simulcast.
		// @type {Object|false}
		this._simulcast = false;

		if (typeof options.simulcast === 'object')
			this._simulcast = Object.assign({}, SIMULCAST_DEFAULT, options.simulcast);
		else if (options.simulcast === true)
			this._simulcast = Object.assign({}, SIMULCAST_DEFAULT);

		// Associated Transport.
		// @type {Transport}
		this._transport = null;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = null;

		// Locally paused flag.
		// @type {Boolean}
		this._locallyPaused = !this._track.enabled;

		// Remotely paused flag.
		// @type {Boolean}
		this._remotelyPaused = false;

		// Periodic stats flag.
		// @type {Boolean}
		this._statsEnabled = false;

		// Periodic stats gathering interval (milliseconds).
		// @type {Number}
		this._statsInterval = DEFAULT_STATS_INTERVAL;

		// Handle the effective track.
		this._handleTrack();
	}

	/**
	 * Producer id.
	 *
	 * @return {Number}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the Producer is closed.
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
	 * Associated Transport.
	 *
	 * @return {Transport}
	 */
	get transport()
	{
		return this._transport;
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
	 * Whether the Producer is locally paused.
	 *
	 * @return {Boolean}
	 */
	get locallyPaused()
	{
		return this._locallyPaused;
	}

	/**
	 * Whether the Producer is remotely paused.
	 *
	 * @return {Boolean}
	 */
	get remotelyPaused()
	{
		return this._remotelyPaused;
	}

	/**
	 * Whether the Producer is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._locallyPaused || this._remotelyPaused;
	}

	/**
	 * Closes the Producer.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		if (this._statsEnabled)
		{
			this._statsEnabled = false;

			if (this.transport)
			{
				this.transport.disableProducerStats(this);
			}
		}

		if (this._transport)
			this._transport.removeProducer(this, 'local', appData);

		this._destroy();

		this.emit('@close', 'local', appData);
		this.safeEmit('close', 'local', appData);
	}

	/**
	 * My remote Producer was closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		if (this._transport)
			this._transport.removeProducer(this, 'remote', appData);

		this._destroy();

		this.emit('@close', 'remote', appData);
		this.safeEmit('close', 'remote', appData);
	}

	_destroy()
	{
		this._transport = false;
		this._rtpParameters = null;

		try { this._track.stop(); }
		catch (error) {}
	}

	/**
	 * Sends RTP.
	 *
	 * @param {transport} Transport instance.
	 *
	 * @return {Promise}
	 */
	send(transport)
	{
		logger.debug('send() [transport:%o]', transport);

		if (this._closed)
			return Promise.reject(new InvalidStateError('Producer closed'));
		else if (this._transport)
			return Promise.reject(new Error('already handled by a Transport'));
		else if (typeof transport !== 'object')
			return Promise.reject(new TypeError('invalid Transport'));

		this._transport = transport;

		return transport.addProducer(this)
			.then(() =>
			{
				transport.once('@close', () =>
				{
					if (this._closed || this._transport !== transport)
						return;

					this._transport.removeProducer(this, 'local');

					this._transport = null;
					this._rtpParameters = null;

					this.safeEmit('unhandled');
				});

				this.safeEmit('handled');

				if (this._statsEnabled)
					transport.enableProducerStats(this, this._statsInterval);
			})
			.catch((error) =>
			{
				this._transport = null;

				throw error;
			});
	}

	/**
	 * Pauses sending media.
	 *
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Boolean} true if paused.
	 */
	pause(appData)
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | Producer closed');

			return false;
		}
		else if (this._locallyPaused)
		{
			return true;
		}

		this._locallyPaused = true;
		this._track.enabled = false;

		if (this._transport)
			this._transport.pauseProducer(this, appData);

		this.safeEmit('pause', 'local', appData);

		// Return true if really paused.
		return this.paused;
	}

	/**
	 * My remote Producer was paused.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remotePause(appData)
	{
		logger.debug('remotePause()');

		if (this._closed || this._remotelyPaused)
			return;

		this._remotelyPaused = true;
		this._track.enabled = false;

		this.safeEmit('pause', 'remote', appData);
	}

	/**
	 * Resumes sending media.
	 *
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Boolean} true if not paused.
	 */
	resume(appData)
	{
		logger.debug('resume()');

		if (this._closed)
		{
			logger.error('resume() | Producer closed');

			return false;
		}
		else if (!this._locallyPaused)
		{
			return true;
		}

		this._locallyPaused = false;

		if (!this._remotelyPaused)
			this._track.enabled = true;

		if (this._transport)
			this._transport.resumeProducer(this, appData);

		this.safeEmit('resume', 'local', appData);

		// Return true if not paused.
		return !this.paused;
	}

	/**
	 * My remote Producer was resumed.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteResume(appData)
	{
		logger.debug('remoteResume()');

		if (this._closed || !this._remotelyPaused)
			return;

		this._remotelyPaused = false;

		if (!this._locallyPaused)
			this._track.enabled = true;

		this.safeEmit('resume', 'remote', appData);
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
			return Promise.reject(new InvalidStateError('Producer closed'));
		else if (!track)
			return Promise.reject(new TypeError('no track given'));
		else if (track.readyState === 'ended')
			return Promise.reject(new Error('track.readyState is "ended"'));

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
				// If this Producer is handled by a Transport, we need to tell it about
				// the new track.
				if (this._transport)
					return this._transport.replaceProducerTrack(this, clonedTrack);
			})
			.then(() =>
			{
				// Stop the previous track.
				try { this._track.onended = null; this._track.stop(); }
				catch (error) {}

				// If this Producer was locally paused/resumed and the state of the new
				// track does not match, fix it.
				if (!this.paused)
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
	 * Set/update RTP parameters.
	 *
	 * @private
	 *
	 * @param {RTCRtpParameters} rtpParameters
	 */
	setRtpParameters(rtpParameters)
	{
		this._rtpParameters = rtpParameters;
	}

	/**
	 * Enables periodic stats retrieval.
	 */
	enableStats(interval = DEFAULT_STATS_INTERVAL)
	{
		logger.debug('enableStats() [interval:%s]', interval);

		if (this._closed)
		{
			logger.error('enableStats() | Producer closed');

			return;
		}

		if (this._statsEnabled)
			return;

		if (typeof interval !== 'number' || interval < 1000)
			this._statsInterval = DEFAULT_STATS_INTERVAL;
		else
			this._statsInterval = interval;

		this._statsEnabled = true;

		if (this._transport)
			this._transport.enableProducerStats(this, this._statsInterval);
	}

	/**
	 * Disables periodic stats retrieval.
	 */
	disableStats()
	{
		logger.debug('disableStats()');

		if (this._closed)
		{
			logger.error('disableStats() | Producer closed');

			return;
		}

		if (!this._statsEnabled)
			return;

		this._statsEnabled = false;

		if (this._transport)
			this._transport.disableProducerStats(this);
	}

	/**
	 * Receive remote stats.
	 *
	 * @private
	 *
	 * @param {Object} stats
	 */
	remoteStats(stats)
	{
		this.safeEmit('stats', stats);
	}

	/**
	 * @private
	 */
	_handleTrack()
	{
		// If the cloned track is closed (for example if the desktop sharing is closed
		// via chrome UI) notify the app and let it decide wheter to close the Producer
		// or not.
		this._track.onended = () =>
		{
			if (this._closed)
				return;

			logger.warn('track "ended" event');

			this.safeEmit('trackended');
		};
	}
}
