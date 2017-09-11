import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';

const PROFILES = new Set([ 'low', 'medium', 'high' ]);

const logger = new Logger('Consumer');

export default class Consumer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {originator: String, [appData]: Any} pause
	 * @emits {originator: String, [appData]: Any} resume
	 * @emits {profile: String} effectiveprofilechange
	 * @emits unhandled
	 * @emits {originator: String} close
	 *
	 * @emits @close
	 */
	constructor(id, kind, rtpParameters, peer, appData)
	{
		super(logger);

		// Id.
		// @type {Number}
		this._id = id;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Media kind.
		// @type {String}
		this._kind = kind;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = rtpParameters;

		// Associated Peer.
		// @type {Peer}
		this._peer = peer;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Whether we can receive this Consumer (based on our RTP capabilities).
		// @type {Boolean}
		this._supported = false;

		// Associated Transport.
		// @type {Transport}
		this._transport = null;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = null;

		// Locally paused flag.
		// @type {Boolean}
		this._locallyPaused = false;

		// Remotely paused flag.
		// @type {Boolean}
		this._remotelyPaused = false;

		// Preferred profile.
		// @type {String}
		this._preferredProfile = null;

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
		return this._kind;
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
	 * Associated Peer.
	 *
	 * @return {Peer}
	 */
	get peer()
	{
		return this._peer;
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
	 * Whether we can receive this Consumer (based on our RTP capabilities).
	 *
	 * @return {Boolean}
	 */
	get supported()
	{
		return this._supported;
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
	 * The associated track (if any yet).
	 *
	 * @return {MediaStreamTrack|Null}
	 */
	get track()
	{
		return this._track;
	}

	/**
	 * Whether the Consumer is locally paused.
	 *
	 * @return {Boolean}
	 */
	get locallyPaused()
	{
		return this._locallyPaused;
	}

	/**
	 * Whether the Consumer is remotely paused.
	 *
	 * @return {Boolean}
	 */
	get remotelyPaused()
	{
		return this._remotelyPaused;
	}

	/**
	 * Whether the Consumer is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._locallyPaused || this._remotelyPaused;
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
	 * Closes the Consumer.
	 * This is called when the local Room is closed.
	 *
	 * @private
	 */
	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close');
		this.safeEmit('close', 'local');

		this._destroy();
	}

	/**
	 * My remote Consumer was closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 */
	remoteClose()
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		if (this._transport)
			this._transport.removeConsumer(this);

		this._destroy();

		this.emit('@close');
		this.safeEmit('close', 'remote');
	}

	_destroy()
	{
		this._transport = null;

		try { this._track.stop(); }
		catch (error) {}

		this._track = null;
	}

	/**
	 * Receives RTP.
	 *
	 * @param {transport} Transport instance.
	 *
	 * @return {Promise} Resolves with a remote MediaStreamTrack.
	 */
	receive(transport)
	{
		logger.debug('receive() [transport:%o]', transport);

		if (this._closed)
			return Promise.reject(new InvalidStateError('Consumer closed'));
		else if (!this._supported)
			return Promise.reject(new Error('unsupported codecs'));
		else if (this._transport)
			return Promise.reject(new Error('already handled by a Transport'));
		else if (typeof transport !== 'object')
			return Promise.reject(new TypeError('invalid Transport'));

		this._transport = transport;

		return transport.addConsumer(this)
			.then((track) =>
			{
				this._track = track;

				// If we were paused, disable the track.
				if (this.paused)
					track.enabled = false;

				transport.once('@close', () =>
				{
					if (this._closed || this._transport !== transport)
						return;

					this._transport = null;

					try { this._track.stop(); }
					catch (error) {}

					this._track = null;

					this.safeEmit('unhandled');
				});

				this.safeEmit('handled');

				return track;
			})
			.catch((error) =>
			{
				this._transport = null;

				throw error;
			});
	}

	/**
	 * Pauses receiving media.
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
			logger.error('pause() | Consumer closed');

			return false;
		}
		else if (this._locallyPaused)
		{
			return true;
		}

		this._locallyPaused = true;

		if (this._track)
			this._track.enabled = false;

		if (this._transport)
			this._transport.pauseConsumer(this, appData);

		this.safeEmit('pause', 'local', appData);

		// Return true if really paused.
		return this.paused;
	}

	/**
	 * My remote Consumer was paused.
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

		if (this._track)
			this._track.enabled = false;

		this.safeEmit('pause', 'remote', appData);
	}

	/**
	 * Resumes receiving media.
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
			logger.error('resume() | Consumer closed');

			return false;
		}
		else if (!this._locallyPaused)
		{
			return true;
		}

		this._locallyPaused = false;

		if (this._track && !this._remotelyPaused)
			this._track.enabled = true;

		if (this._transport)
			this._transport.resumeConsumer(this, appData);

		this.safeEmit('resume', 'local', appData);

		// Return true if not paused.
		return !this.paused;
	}

	/**
	 * My remote Consumer was resumed.
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

		if (this._track && !this._locallyPaused)
			this._track.enabled = true;

		this.safeEmit('resume', 'remote', appData);
	}

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
	 * Mark this Consumer as suitable for reception or not.
	 *
	 * @private
	 *
	 * @param {Boolean} flag
	 */
	setSupported(flag)
	{
		this._supported = flag;
	}
}
