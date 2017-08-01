'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import * as utils from './utils';
import { InvalidStateError } from './errors';

const logger = new Logger('Sender');

/**
 * The Sender class is responsible of managing a local MediaStreamTrack.
 */
export default class Sender extends SafeEventEmitter
{
	constructor(track)
	{
		super();

		// Class name.
		// @type {String}
		this._klass = 'Sender';

		// Id.
		// @type {Number}
		this._id = utils.randomNumber();

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// MediaStreamTrack instance cloned from the original one.
		// @type {MediaStreamTrack}
		this._track = track;

		// Whether this Sender has an assigned Transport.
		// @type {Boolean}
		this._hasTransport = false;
	}

	/**
	 * Class name.
	 *
	 * @return {String}
	 */
	get klass()
	{
		return this._klass;
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
	 * The associated track.
	 *
	 * @return {MediaStreamTrack}
	 */
	get track()
	{
		return this._track;
	}

	/**
	 * Whether the Sender is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._track.enabled === false;
	}

	/**
	 * Closes the Sender and stops the cloned track.
	 *
	 * @param {Error} [error] - Optional error.
	 */
	close(error)
	{
		if (!error)
			logger.debug('close()');
		else
			logger.error('close() [error:%s]', error.toString());

		if (this._closed)
			return;

		this._closed = true;
		try { this._track.stop(); } catch (error) {}
		this.safeEmit('close', error);
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

	/**
	 * Whether the Sender has a Transport.
	 *
	 * @private
	 * @return {Boolean}
	 */
	hasTransport()
	{
		return this._hasTransport;
	}

	/**
	 * Set this Sender as handled by a Transport.
	 *
	 * @private
	 * @param {Boolean} flag
	 */
	setTransport(flag)
	{
		this._hasTransport = flag;
	}
}
