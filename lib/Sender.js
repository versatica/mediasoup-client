'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as utils from './utils';
import { InvalidStateError } from './errors';

const logger = new Logger('Sender');

/**
 * The Sender class is responsible of managing a local MediaStreamTrack.
 */
export default class Sender extends EnhancedEventEmitter
{
	constructor(track, originalTrack)
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

		// Track cloned from the original one.
		// @type {MediaStreamTrack}
		this._track = track;

		// Original track.
		// @type {MediaStreamTrack}
		this._originalTrack = originalTrack;

		// App custom data.
		// @type {Any}
		this._appData = undefined;

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
	 * Set app custom data.
	 *
	 * @param {Any} data
	 */
	set appData(data)
	{
		this._appData = data;
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
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;
		try { this._track.stop(); } catch (error) {}
		this.safeEmit('close', appData);
	}

	/**
	 * Pauses the track.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise} Resolves once paused.
	 */
	pause(appData)
	{
		logger.debug('pause()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));
		else if (this.paused)
			return Promise.reject(new InvalidStateError('Sender already paused'));

		this._track.enabled = false;
		this.safeEmit('pause', appData);

		return Promise.resolve();
	}

	/**
	 * Resumes the track.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise} Resolves once resumed.
	 */
	resume(appData)
	{
		logger.debug('resume()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Sender closed'));
		else if (!this.paused)
			return Promise.reject(new InvalidStateError('Sender not paused'));

		this._track.enabled = true;
		this.safeEmit('resume', appData);

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
		this._hasTransport = Boolean(flag);
	}
}
