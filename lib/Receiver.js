'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';

const logger = new Logger('Receiver');

export default class Receiver extends EnhancedEventEmitter
{
	constructor(id, kind, rtpParameters, paused, appData)
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

		// Remotely paused flag.
		// @type {Boolean}
		this._paused = paused;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Receiving and playing the remote track.
		// @type {Boolean}
		this._playing = false;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = null;

		// Whether this Receiver has an assigned Transport.
		// @type {Boolean}
		this._hasTransport = false;

		// Busy doing a operation.
		// @type {Boolean}
		this._busy = false;
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
	 * @private
	 * @return {RTCRtpParameters}
	 */
	get rtpParameters()
	{
		return this._rtpParameters;
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
	 * Whether the remote sender has paused the track.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._paused;
	}

	/**
	 * Whether the track isbeing played.
	 *
	 * @return {Boolean}
	 */
	get playing()
	{
		return Boolean(this._track) && this._playing;
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
	 * Enables the reception of the track.
	 *
	 * @return {Promise}
	 */
	play()
	{
		logger.debug('play()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Receiver closed'));
		else if (!this._track)
			return Promise.reject(new InvalidStateError('Receiver has no track'));
		else if (this._busy)
			return Promise.reject(new InvalidStateError('operation in progress'));
		else if (this.playing)
			return Promise.resolve();

		this._busy = true;

		return this.safeEmitAsPromise('play')
			.then(() =>
			{
				if (this._closed)
					throw new InvalidStateError('Receiver closed');

				this._busy = false;
				this._playing = true;
			})
			.catch((error) =>
			{
				this._busy = false;

				throw error;
			});
	}

	/**
	 * Disables the reception of the track.
	 *
	 * @return {Promise}
	 */
	stop()
	{
		logger.debug('stop()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('Receiver closed'));
		else if (!this._track)
			return Promise.reject(new InvalidStateError('Receiver has no track'));
		else if (this._busy)
			return Promise.reject(new InvalidStateError('operation in progress'));
		else if (!this.playing)
			return Promise.resolve();

		this._busy = true;

		return this.safeEmitAsPromise('stop')
			.then(() =>
			{
				if (this._closed)
					throw new InvalidStateError('Receiver closed');

				this._busy = false;
				this._playing = false;
			})
			.catch((error) =>
			{
				this._busy = false;

				throw error;
			});
	}

	/**
	 * Closes the Receiver.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;
		this.safeEmit('close', appData);
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
	 * Set the remote track.
	 *
	 * @private
	 * @param {track} MediaStreamTrack
	 */
	setTrack(track)
	{
		this._track = track;
	}

	/**
	 * The remote Sender paused or resumed its local track.
	 *
	 * @private
	 * @param {Boolean} flag
	 */
	setPaused(flag)
	{
		if (this._paused === flag)
			return;

		this._paused = flag;

		if (this._paused)
			this.safeEmit('pause');
		else
			this.safeEmit('resume');
	}
}
