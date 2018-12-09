const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const { InvalidStateError } = require('./errors');

const PROFILES = new Set([ 'default', 'low', 'medium', 'high' ]);

const logger = new Logger('Consumer');

class Consumer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits transportclose
	 * @emits trackended
	 * @emits @getstats
	 * @emits @close
	 */
	constructor({ id, track, rtpParameters, preferredProfile, appData })
	{
		super(logger);

		// Id.
		// @type {String}
		this._id = id;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = track;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = rtpParameters;

		// Paused flag.
		// @type {Boolean}
		this._paused = !track.enabled;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Preferred profile.
		// @type {String}
		this._preferredProfile = preferredProfile || 'default';

		// Effective profile.
		// @type {String}
		this._effectiveProfile = null;

		this._onTrackEnded = this._onTrackEnded.bind(this);

		this._handleTrack();
	}

	/**
	 * Consumer id.
	 *
	 * @return {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the consumer is closed.
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
	 * RTP parameters.
	 *
	 * @return {RTCRtpParameters}
	 */
	get rtpParameters()
	{
		return this._rtpParameters;
	}

	/**
	 * Whether the consumer is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._paused;
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
	 * Preferred profile.
	 *
	 * @type {String}
	 */
	get preferredProfile()
	{
		return this._preferredProfile;
	}

	/**
	 * Set preferred profile.
	 *
	 * @param {String} profile
	 */
	set preferredProfile(profile)
	{
		if (this._closed || profile === this._preferredProfile)
		{
			return;
		}
		else if (!PROFILES.has(profile))
		{
			logger.error('set preferredProfile | invalid profile "%s"', profile);

			return;
		}

		this._preferredProfile = profile;
	}

	/**
	 * Effective profile.
	 *
	 * @type {String}
	 */
	get effectiveProfile()
	{
		return this._effectiveProfile;
	}

	/**
	 * Set effective profile.
	 *
	 * @param {String} profile
	 */
	set effectiveProfile(profile)
	{
		if (this._closed || profile === this._effectiveProfile)
		{
			return;
		}
		else if (!PROFILES.has(profile) && profile !== 'none')
		{
			logger.error('set effectiveProfile | invalid profile "%s"', profile);

			return;
		}

		this._effectiveProfile = profile;
	}

	/**
	 * Closes the consumer.
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
	 * Pauses receiving media.
	 */
	pause()
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | consumer closed');

			return;
		}

		this._paused = true;
		this._track.enabled = false;
	}

	/**
	 * Resumes receiving media.
	 */
	resume()
	{
		logger.debug('resume()');

		if (this._closed)
		{
			logger.error('resume() | consumer closed');

			return;
		}

		this._paused = false;
		this._track.enabled = true;
	}

	/**
	 * Get associated RTCRtpReceiver stats.
	 *
	 * @promise
	 * @fulfill {RTCStatsReport}
	 * @reject {InvalidStateError} if consumer closed.
	 */
	getStats()
	{
		if (this._closed)
			return Promise.reject(new InvalidStateError('consumer closed'));

		return this.safeEmitAsPromise('@getstats');
	}

	/**
	 * @private
	 */
	_onTrackEnded()
	{
		logger.debug('track "ended" event');

		this.safeEmit('trackended');
	}

	/**
	 * @private
	 */
	_handleTrack()
	{
		this._track.addEventListener('ended', this._onTrackEnded);
	}

	/**
	 * @private
	 */
	_destroyTrack()
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

module.exports = Consumer;
