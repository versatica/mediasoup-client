'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as utils from './utils';
import { InvalidStateError } from './errors';

const logger = new Logger('Sender');

export default class Sender extends EnhancedEventEmitter
{
	/**
	 * @emits {function()} unhandled
	 * @emits {function([appData]: Any)} close
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

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = null;

		// Paused flag.
		// @type {Boolean}
		this._paused = !this._track.enabled;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Whether this Sender is being handled by a Transport.
		// @type {Boolean}
		this._handled = false;

		// pause() or resume() in progress.
		// @type {Boolean}
		this._pauseResumeInProgress = false;
	}

	/**
	 * Class name.
	 *
	 * @return {String}
	 */
	get klass()
	{
		return 'Sender';
	}

	/**
	 * Sender id.
	 *
	 * @return {Number}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the Sender is closed.
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
	 * Whether the Sender is paused.
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
	 * Closes the Sender and stops the cloned track.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;
		this._handled = false;
		this._rtpParameters = null;
		try { this._track.stop(); } catch (error) {}
		this.safeEmit('close', appData);
	}

	/**
	 * Pauses the track.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise}
	 */
	pause(appData)
	{
		logger.debug('pause()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));
		else if (this._pauseResumeInProgress)
			return Promise.reject(new InvalidStateError('operation in progress'));
		else if (this.paused)
			return Promise.resolve();

		this._pauseResumeInProgress = true;
		this._track.enabled = false;

		return this.safeEmitAsPromise('pause', appData)
			.then(() =>
			{
				this._pauseResumeInProgress = false;

				if (this._closed)
					throw new InvalidStateError('Sender closed');

				this._paused = true;
			})
			.catch((error) =>
			{
				this._pauseResumeInProgress = false;

				throw error;
			});
	}

	/**
	 * Resumes the track.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise}
	 */
	resume(appData)
	{
		logger.debug('resume()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));
		else if (this._pauseResumeInProgress)
			return Promise.reject(new InvalidStateError('operation in progress'));
		else if (!this.paused)
			return Promise.resolve();

		this._pauseResumeInProgress = true;
		this._track.enabled = true;

		return this.safeEmitAsPromise('resume', appData)
			.then(() =>
			{
				this._pauseResumeInProgress = false;

				if (this._closed)
					throw new InvalidStateError('Sender closed');

				this._track.enabled = false;
				this._paused = false;
			})
			.catch((error) =>
			{
				this._pauseResumeInProgress = false;

				throw error;
			});
	}

	/**
	 * Set this Sender as handled or unhandled by a Transport.
	 *
	 * @private
	 * @param {Boolean|String} flag - If 'tmp' (String) it's considered as termporal.
	 */
	setHandled(flag)
	{
		const previous = this._handled;

		this._handled = flag;

		if (flag === false || flag === 'tmp')
			this._rtpParameters = null;
		if (previous === true && flag === false)
			this.safeEmit('unhandled');
	}

	/**
	 * Set associated RTP parameters.
	 *
	 * @private
	 * @param {RTCRtpParameters} rtpParameters
	 */
	setRtpParameters(rtpParameters)
	{
		this._rtpParameters = rtpParameters;
	}
}
