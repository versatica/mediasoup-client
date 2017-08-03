'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';

const logger = new Logger('Receiver');

export default class Receiver extends EnhancedEventEmitter
{
	constructor(id, rtpParameters, appData)
	{
		super();

		// Id.
		// @type {Number}
		this._id = id;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = rtpParameters;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = null;

		// Whether this Receiver has an assigned Transport.
		// @type {Boolean}
		this._hasTransport = false;

		// App custom data.
		// @type {Any}
		this._appData = appData;
	}

	/**
	 * Class name.
	 *
	 * @return {String}
	 */
	get klass()
	{
		return 'Receiver';
	}

	/**
	 * Receiver id.
	 *
	 * @return {Number}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the Receiver is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
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
	 * App custom data.
	 *
	 * @return {Any}
	 */
	get appData()
	{
		return this._appData;
	}

	/**
	 * Whether the Receiver is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return (Boolean(this._track) && this._track.enabled === false);
	}

	/**
	 * Requests pausing reception of the track.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise} Resolves once paused.
	 */
	pause(appData)
	{
		logger.debug('pause()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Receiver closed'));
		else if (!this._track)
			return Promise.reject(new InvalidStateError('non receiving Receiver'));
		else if (this.paused)
			return Promise.reject(new InvalidStateError('Receiver already paused'));

		this._track.enabled = false;
		this.safeEmit('pause', appData);

		return Promise.resolve();
	}

	/**
	 * Requests resuming reception of the track.
	 *
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise} Resolves once resumed.
	 */
	resume(appData)
	{
		logger.debug('resume()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Receiver closed'));
		else if (!this._track)
			return Promise.reject(new InvalidStateError('non receiving Receiver'));
		else if (!this.paused)
			return Promise.reject(new InvalidStateError('Receiver not paused'));

		this._track.enabled = true;
		this.safeEmit('resume', appData);

		return Promise.resolve();
	}

	/**
	 * Whether the Receiver has a Transport.
	 *
	 * @private
	 * @return {Boolean}
	 */
	hasTransport()
	{
		return this._hasTransport;
	}

	/**
	 * Set this Receiver as handled by a Transport.
	 *
	 * @private
	 * @param {Boolean} flag
	 */
	setTransport(flag)
	{
		this._hasTransport = Boolean(flag);
	}

	/**
	 * Set the rmeote track.
	 *
	 * @private
	 * @param {track} MediaStreamTrack
	 */
	setTrack(track)
	{
		this._track = track;
	}
}
