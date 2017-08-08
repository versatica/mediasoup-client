'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';

const logger = new Logger('Consumer');

export default class Consumer extends EnhancedEventEmitter
{
	/**
	 * @emits {originator: String, [appData]: Any} paused
	 * @emits {originator: String, [appData]: Any} resumed
	 * @emits unhandled
	 * @emits {originator: String, [appData]: Any} closed
	 *
	 * @emits {[appData]: Any} @pause
	 * @emits {[appData]: Any} @resume
	 * @emits {originator: String} @close
	 *
	 */
	constructor(id, kind, rtpParameters, appData)
	{
		super();

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

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Whether we can receive this Consumer (based on our RTP capabilities).
		// @type {Boolean}
		this._supported = false;

		// RTP settings for enabling the Consumer.
		// @type {Object}
		this._rtpSettings = null;

		// Whether this Consumer is being handled by a Transport.
		// @type {Boolean}
		this._handled = false;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = null;

		// Locally paused flag.
		// @type {Boolean}
		this._locallyPaused = false;

		// Remotely paused flag.
		// @type {Boolean}
		this._remotelyPaused = false;
	}

	/**
	 * Class name.
	 *
	 * @return {String}
	 */
	get klass()
	{
		return 'Consumer';
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
	 * RTP settings for enabling the Consumer.
	 *
	 * @private
	 * @return {Object}
	 */
	get rtpSettings()
	{
		return this._rtpSettings;
	}

	/**
	 * Whether this is being handled by a Transport.
	 *
	 * @return {Boolean}
	 */
	get handled()
	{
		return Boolean(this._handled);
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
	 * Whether the Consumer is actually receiving media.
	 *
	 * @return {Boolean}
	 */
	get active()
	{
		return (!this._closed && this.handled === true && !this.paused);
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

		this.emit('@close', 'local');
		this.safeEmit('closed', 'local');

		this.destroy();
	}

	/**
	 * My remote Consumer was closed.
	 * Invoked via remote notification.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close', 'remote');
		this.safeEmit('closed', 'remote', appData);

		this.destroy();
	}

	/**
	 * Destroys the Consumer.
	 *
	 * @private
	 */
	destroy()
	{
		this._handled = false;

		try { this._track.stop(); } catch (error) {}

		this._track = null;
	}

	/**
	 * Pauses receiving media.
	 *
	 * @param {Any} [appData] - App custom data.
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
		else if (!this._handled)
		{
			logger.error('pause() | Consumer not handled');

			return false;
		}
		else if (this._locallyPaused)
		{
			return true;
		}

		this._locallyPaused = true;
		this._track.enabled = false;

		this.emit('@pause', appData);

		if (!this._remotelyPaused)
			this.safeEmit('paused', 'local', appData);

		// Return true if really paused.
		return this.paused;
	}

	/**
	 * My remote Consumer was paused.
	 * Invoked via remote notification.
	 *
	 * @private
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

		if (!this._locallyPaused)
			this.safeEmit('paused', 'remote', appData);
	}

	/**
	 * Resumes receiving media.
	 *
	 * @param {Any} [appData] - App custom data.
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
		else if (!this._handled)
		{
			logger.error('pause() | Consumer not handled');

			return false;
		}
		else if (!this._locallyPaused)
		{
			return true;
		}

		this._locallyPaused = false;

		this.emit('@resume', appData);

		if (!this._remotelyPaused)
		{
			this._track.enabled = true;

			this.safeEmit('resumed', 'local', appData);
		}

		// Return true if not paused.
		return !this.paused;
	}

	/**
	 * My remote Consumer was resumed.
	 * Invoked via remote notification.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	remoteResume(appData)
	{
		logger.debug('remoteResume()');

		if (this._closed || !this._remotelyPaused)
			return;

		this._remotelyPaused = false;

		if (!this._locallyPaused)
		{
			if (this._track)
				this._track.enabled = false;

			this.safeEmit('resumed', 'remote', appData);
		}
	}

	/**
	 * Mark this Consumer as suitable for reception or not.
	 *
	 * @private
	 * @param {Boolean} flag
	 */
	setSupported(flag)
	{
		this._supported = flag;
	}

	/**
	 * Set RTP settings for enabling the Consumer.
	 *
	 * @private
	 * @param {Object} settings
	 */
	setRtpSettings(rtpSettings)
	{
		this._rtpSettings = rtpSettings;
	}

	/**
	 * Set this Consumer as handled or unhandled by a Transport.
	 *
	 * @private
	 * @param {Boolean|String} flag - If 'tmp' (String) it's considered as termporal.
	 * @param {track} MediaStreamTrack
	 */
	setHandled(flag, track)
	{
		if (this._closed)
			return;

		const previous = this._handled;

		this._handled = flag;
		this._track = track || null;

		if (track && this.paused)
			this._track.enabled = false;

		if (flag === false || flag === 'tmp')
		{
			try { this._track.stop(); } catch (error) {}

			this._track = null;
		}

		if (previous === true && flag === false)
			this.safeEmit('unhandled');
	}
}
