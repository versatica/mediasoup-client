'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';

const logger = new Logger('Receiver');

export default class Receiver extends EnhancedEventEmitter
{
	/**
	 * @emits {function([appData]: Any)} pause
	 * @emits {function([appData]: Any)} resume
	 * @emits {function([appData]: Any)} close
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

		// Whether we can receive this Receiver (based on our RTP capabilities).
		// @type {Boolean}
		this._supported = false;

		// RTP settings for enabling the remote Sender.
		// @type {Object}
		this._rtpSettings = null;

		// Remotely paused flag.
		// @type {Boolean}
		this._paused = false;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Receiving and playing the remote track.
		// @type {Boolean}
		this._playing = true;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = null;

		// Whether this Receiver is being handled by a Transport.
		// @type {Boolean}
		this._handled = false;

		// play() or stop() in progress.
		// @type {Boolean}
		this._playStopInProgres = false;
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
	 * Whether we can receive this Receiver (based on our RTP capabilities).
	 *
	 * @return {Boolean}
	 */
	get supported()
	{
		return this._supported;
	}

	/**
	 * RTP settings for enabling the remote Sender.
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
	 * Whether the remote sender has paused the track.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._paused;
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
		else if (this._playStopInProgres)
			return Promise.reject(new InvalidStateError('operation in progress'));
		else if (this.playing)
			return Promise.resolve();

		this._playStopInProgres = true;

		return this.safeEmitAsPromise('play')
			.then(() =>
			{
				if (this._closed)
					throw new InvalidStateError('Receiver closed');

				this._playStopInProgres = false;
				this._playing = true;
			})
			.catch((error) =>
			{
				this._playStopInProgres = false;

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
		else if (this._playStopInProgres)
			return Promise.reject(new InvalidStateError('operation in progress'));
		else if (!this.playing)
			return Promise.resolve();

		this._playStopInProgres = true;

		return this.safeEmitAsPromise('stop')
			.then(() =>
			{
				if (this._closed)
					throw new InvalidStateError('Receiver closed');

				this._playStopInProgres = false;
				this._playing = false;
			})
			.catch((error) =>
			{
				this._playStopInProgres = false;

				throw error;
			});
	}

	/**
	 * Notifies that the associated remote Sender has been closed.
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
	 * Mark this Receiver as suitable for reception or not.
	 *
	 * @private
	 * @param {Boolean} flag
	 */
	setSupported(flag)
	{
		this._supported = flag;
	}

	/**
	 * Set RTP settings for enabling the remote Sender.
	 *
	 * @private
	 * @param {Object} settings
	 */
	setRtpSettings(rtpSettings)
	{
		this._rtpSettings = rtpSettings;
	}

	/**
	 * The remote Sender paused or resumed its local track.
	 *
	 * @private
	 * @param {Boolean} flag
	 * @param {Any} [appData] - App custom data.
	 */
	setPaused(flag, appData)
	{
		if (this._paused === flag)
			return;

		this._paused = flag;

		if (this._paused)
			this.safeEmit('pause', appData);
		else
			this.safeEmit('resume', appData);
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

		if (previous === true && flag === false)
			this.safeEmit('unhandled');
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
}
