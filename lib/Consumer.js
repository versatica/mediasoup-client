const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const { InvalidStateError } = require('./errors');

const logger = new Logger('Consumer');

class Consumer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits transportclose
	 * @emits trackended
	 * @emits @getstats
	 * @emits @close
	 */
	constructor({ id, localId, producerId, track, rtpParameters, appData })
	{
		super(logger);

		// Id.
		// @type {String}
		this._id = id;

		// Local id.
		// @type {String}
		this._localId = localId;

		// Associated Producer id.
		// @type {String}
		this._producerId = producerId;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Remote track.
		// @type {MediaStreamTrack}
		this._track = track;

		// RTP parameters.
		// @type {RTCRtpParameters}
		this._rtpParameters = rtpParameters;

		// Paused flag.
		// @type {Boolean}
		this._paused = !track.enabled;

		// App custom data.
		// @type {Object}
		this._appData = appData;

		this._onTrackEnded = this._onTrackEnded.bind(this);

		this._handleTrack();
	}

	/**
	 * Consumer id.
	 *
	 * @returns {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Local id.
	 *
	 * @private
	 * @returns {String}
	 */
	get localId()
	{
		return this._localId;
	}

	/**
	 * Associated Producer id.
	 *
	 * @returns {String}
	 */
	get producerId()
	{
		return this._producerId;
	}

	/**
	 * Whether the Consumer is closed.
	 *
	 * @returns {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * Media kind.
	 *
	 * @returns {String}
	 */
	get kind()
	{
		return this._track.kind;
	}

	/**
	 * The associated track.
	 *
	 * @returns {MediaStreamTrack}
	 */
	get track()
	{
		return this._track;
	}

	/**
	 * RTP parameters.
	 *
	 * @returns {RTCRtpParameters}
	 */
	get rtpParameters()
	{
		return this._rtpParameters;
	}

	/**
	 * Whether the Consumer is paused.
	 *
	 * @returns {Boolean}
	 */
	get paused()
	{
		return this._paused;
	}

	/**
	 * App custom data.
	 *
	 * @returns {Object}
	 */
	get appData()
	{
		return this._appData;
	}

	/**
	 * Invalid setter.
	 */
	set appData(appData) // eslint-disable-line no-unused-vars
	{
		throw new Error('cannot override appData object');
	}

	/**
	 * Closes the Consumer.
	 */
	close()
	{
		if (this._closed)
			return;

		logger.debug('close()');

		this._closed = true;

		this._destroyTrack();

		this.emit('@close');
	}

	/**
	 * Transport was closed.
	 *
	 * @private
	 */
	transportClosed()
	{
		if (this._closed)
			return;

		logger.debug('transportClosed()');

		this._closed = true;

		this._destroyTrack();

		this.safeEmit('transportclose');
	}

	/**
	 * Get associated RTCRtpReceiver stats.
	 *
	 * @async
	 * @returns {RTCStatsReport}
	 * @throws {InvalidStateError} if Consumer closed.
	 */
	async getStats()
	{
		if (this._closed)
			throw new InvalidStateError('closed');

		return this.safeEmitAsPromise('@getstats');
	}

	/**
	 * Pauses receiving media.
	 */
	pause()
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | Consumer closed');

			return;
		}

		this._paused = true;
		this._track.enabled = false;
	}

	/**
	 * Resumes receiving media.
	 */
	resume()
	{
		logger.debug('resume()');

		if (this._closed)
		{
			logger.error('resume() | Consumer closed');

			return;
		}

		this._paused = false;
		this._track.enabled = true;
	}

	/**
	 * @private
	 */
	_onTrackEnded()
	{
		logger.debug('track "ended" event');

		this.safeEmit('trackended');
	}

	/**
	 * @private
	 */
	_handleTrack()
	{
		this._track.addEventListener('ended', this._onTrackEnded);
	}

	/**
	 * @private
	 */
	_destroyTrack()
	{
		try
		{
			this._track.removeEventListener('ended', this._onTrackEnded);
			this._track.stop();
		}
		catch (error)
		{}
	}
}

module.exports = Consumer;
