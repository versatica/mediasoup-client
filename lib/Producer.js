import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as utils from './utils';

const logger = new Logger('Producer');

export default class Producer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {originator: String, [appData]: Any} paused
	 * @emits {originator: String, [appData]: Any} resumed
	 * @emits unhandled
	 * @emits {originator: String, [appData]: Any} closed
	 *
	 * @emits {[appData]: Any} @pause
	 * @emits {[appData]: Any} @resume
	 * @emits {originator: String, [appData]: Any} @close
	 *
	 */
	constructor(track, originalTrack, appData)
	{
		super();

		// Id.
		// @type {Number}
		this._id = utils.randomNumber();

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Track cloned from the original one.
		// @type {MediaStreamTrack}
		this._track = track;

		// Original track.
		// @type {MediaStreamTrack}
		this._originalTrack = originalTrack;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Whether this Producer is being handled by a Transport.
		// @type {Boolean}
		this._handled = false;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = null;

		// Locally paused flag.
		// @type {Boolean}
		this._locallyPaused = !this._track.enabled;

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
		return 'Producer';
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
	 * App custom data.
	 *
	 * @return {Any}
	 */
	get appData()
	{
		return this._appData;
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
	 * Whether the Producer is actually sending media.
	 *
	 * @return {Boolean}
	 */
	get active()
	{
		return (!this._closed && this.handled === true && !this.paused);
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

		this.emit('@close', 'local', appData);
		this.safeEmit('closed', 'local', appData);

		this._destroy();
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

		this.emit('@close', 'remote', appData);
		this.safeEmit('closed', 'remote', appData);

		this._destroy();
	}

	_destroy()
	{
		this._closed = true;
		this._handled = false;
		this._rtpParameters = null;

		try { this._track.stop(); }
		catch (error) {}
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
		else if (!this._handled)
		{
			logger.error('pause() | Producer not handled');

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

		if (this._closed || !this._handled || this._remotelyPaused)
			return;

		this._remotelyPaused = true;
		this._track.enabled = false;

		if (!this._locallyPaused)
			this.safeEmit('paused', 'remote', appData);
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
		else if (!this._handled)
		{
			logger.error('pause() | Producer not handled');

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

		if (this._closed || !this._handled || !this._remotelyPaused)
			return;

		this._remotelyPaused = false;

		if (!this._locallyPaused)
		{
			this._track.enabled = true;

			this.safeEmit('resumed', 'remote', appData);
		}
	}

	/**
	 * Set this Producer as handled or unhandled by a Transport.
	 *
	 * @private
	 *
	 * @param {Boolean|String} flag - If 'tmp' (String) it's considered as termporal.
	 * @param {RTCRtpParameters} rtpParameters
	 */
	setHandled(flag, rtpParameters)
	{
		if (this._closed)
			return;

		const previous = this._handled;

		this._handled = flag;
		this._rtpParameters = rtpParameters;

		if (flag === false || flag === 'tmp')
			this._rtpParameters = null;

		if (previous === true && flag === false)
			this.safeEmit('unhandled');
	}
}
