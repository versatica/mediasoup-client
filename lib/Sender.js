'use strict';

import { EventEmitter } from 'events';
import Logger from './Logger';
import { InvalidStateError } from './errors';

const logger = new Logger('Sender');

/**
 * The Sender class is responsible of managing a local MediaStreamTrack.
 */
export default class Sender extends EventEmitter
{
	/**
	 * @ignore
	 */
	constructor(track, originalTrackId)
	{
		super();
		this.setMaxListeners(Infinity);

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// MediaStreamTrack instance cloned from the original one.
		// @type {MediaStreamTrack}
		this._track = track;

		// id of the original track given by the app.
		// @type {String}
		this._originalTrackId = originalTrackId;

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
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * The id of this sender. It matches the id of the managed cloned track.
	 * @return {String}
	 */
	get id()
	{
		return this._track.id;
	}

	/**
	 * The id of the originally given track.
	 * @return {String}
	 */
	get originalTrackId()
	{
		return this._originalTrackId;
	}

	/**
	 * The associated track.
	 * @return {MediaStreamTrack}
	 */
	get track()
	{
		return this._track;
	}

	/**
	 * Whether the track is paused.
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._track.enabled === false;
	}

	/**
	 * Closes the track and stops the cloned track.
	 */
	close()
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;
		try { this._track.stop(); } catch (error) {}
		this.emit('close');
	}

	/**
	 * Pauses the track.
	 * @return {Promise} Resolves once paused, rejected otherwise.
	 */
	pause()
	{
		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));

		logger.debug('pause()');

		if (this.paused)
			return Promise.reject(new InvalidStateError('Sender already paused'));

		this._track.enabled = false;
		this.emit('pause');

		return Promise.resolve();
	}

	/**
	 * Resumes the track.
	 * @return {Promise} Resolves once resumed, rejected otherwise.
	 */
	resume()
	{
		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));

		logger.debug('resume()');

		if (!this.paused)
			return Promise.reject(new InvalidStateError('Sender not paused'));

		this._track.enabled = true;
		this.emit('resume');

		return Promise.resolve();
	}
}
