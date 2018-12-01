import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';

const PROFILES = new Set([ 'default', 'low', 'medium', 'high' ]);

const logger = new Logger('Consumer');

export default class Consumer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits transportclose
	 * @emits @close
	 */
	constructor({ id, track, rtpParameters, appData })
	{
		super(logger);

		// Id.
		// @type {Number}
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
		this._paused = !this._track.enabled;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// TODO:

		// Preferred profile.
		// @type {String}
		this._preferredProfile = 'default';

		// Effective profile.
		// @type {String}
		this._effectiveProfile = null;
	}

	/**
	 * Consumer id.
	 *
	 * @return {Number}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the Consumer is closed.
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
	 * Set track.
	 *
	 * @private
	 *
	 * @return {MediaStreamTrack}
	 */
	set track(track)
	{
		this._track = track;
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
	 * The preferred profile.
	 *
	 * @type {String}
	 */
	get preferredProfile()
	{
		return this._preferredProfile;
	}

	/**
	 * The effective profile.
	 *
	 * @type {String}
	 */
	get effectiveProfile()
	{
		return this._effectiveProfile;
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

	// TODO

	/**
	 * Set preferred receiving profile.
	 *
	 * @param {String} profile
	 */
	setPreferredProfile(profile)
	{
		logger.debug('setPreferredProfile() [profile:%s]', profile);

		if (this._closed)
		{
			logger.error('setPreferredProfile() | Consumer closed');

			return;
		}
		else if (profile === this._preferredProfile)
		{
			return;
		}
		else if (!PROFILES.has(profile))
		{
			logger.error('setPreferredProfile() | invalid profile "%s"', profile);

			return;
		}

		this._preferredProfile = profile;

		if (this._transport)
			this._transport.setConsumerPreferredProfile(this, this._preferredProfile);
	}

	/**
	 * Preferred receiving profile was set on my remote Consumer.
	 *
	 * @param {String} profile
	 */
	remoteSetPreferredProfile(profile)
	{
		logger.debug('remoteSetPreferredProfile() [profile:%s]', profile);

		if (this._closed || profile === this._preferredProfile)
			return;

		this._preferredProfile = profile;
	}

	/**
	 * Effective receiving profile changed on my remote Consumer.
	 *
	 * @param {String} profile
	 */
	remoteEffectiveProfileChanged(profile)
	{
		logger.debug('remoteEffectiveProfileChanged() [profile:%s]', profile);

		if (this._closed || profile === this._effectiveProfile)
			return;

		this._effectiveProfile = profile;

		this.safeEmit('effectiveprofilechange', this._effectiveProfile);
	}

	/**
	 * @private
	 */
	_destroyTrack()
	{
		try
		{
			this._track.stop();
		}
		catch (error)
		{}
	}
}
