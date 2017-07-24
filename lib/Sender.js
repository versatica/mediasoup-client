'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import { InvalidStateError } from './errors';

const logger = new Logger('Sender');

/**
 * The Sender class is responsible of managing a local MediaStreamTrack.
 */
export default class Sender extends SafeEventEmitter
{
	constructor(track, originalTrackId)
	{
		super();

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// MediaStreamTrack instance cloned from the original one.
		// @type {MediaStreamTrack}
		this._track = track;

		// id field of the original track given by the app.
		// @type {String}
		this._originalTrackId = originalTrackId;

		// TODO: This will cause problems once replaceTrack is implemented.
		this._track.addEventListener('ended', () =>
		{
			if (this._closed)
				return;

			logger.warn('track ended, closing sender');

			this.close();
		});
	}

	/**
	 * Whether the track is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * The id of this Sender. It matches the id of the managed cloned track.
	 *
	 * @return {String}
	 */
	get id()
	{
		return this._track.id;
	}

	/**
	 * The id of the originally given track.
	 *
	 * @return {String}
	 */
	get originalTrackId()
	{
		return this._originalTrackId;
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
	 * Whether the track is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._track.enabled === false;
	}

	/**
	 * Closes the Sender and stops the cloned track.
	 */
	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;
		try { this._track.stop(); } catch (error) {}
		this.safeEmit('close');
	}

	/**
	 * Pauses the track.
	 *
	 * @return {Promise} Resolves once paused.
	 */
	pause()
	{
		logger.debug('pause()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));
		else if (this.paused)
			return Promise.reject(new InvalidStateError('Sender already paused'));

		this._track.enabled = false;
		this.safeEmit('pause');

		return Promise.resolve();
	}

	/**
	 * Resumes the track.
	 *
	 * @return {Promise} Resolves once resumed.
	 */
	resume()
	{
		logger.debug('resume()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));
		else if (!this.paused)
			return Promise.reject(new InvalidStateError('Sender not paused'));

		this._track.enabled = true;
		this.safeEmit('resume');

		return Promise.resolve();
	}
}
