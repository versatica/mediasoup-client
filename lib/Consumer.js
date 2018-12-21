const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const utils = require('./utils');
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
	constructor({ id, producerId, track, rtpParameters, preferredSpatialLayer, appData })
	{
		super(logger);

		// Id.
		// @type {String}
		this._id = id;

		// Associated producer id.
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

		// Preferred spatial layer.
		// @type {String}
		this._preferredSpatialLayer = preferredSpatialLayer;

		// Effective spatial layer.
		// @type {String}
		this._effectiveSpatialLayer = null;

		// App custom data.
		// @type {Object}
		this._appData = appData;

		this._onTrackEnded = this._onTrackEnded.bind(this);

		this._handleTrack();
	}

	/**
	 * Consumer id.
	 *
	 * @return {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Associated producer id.
	 *
	 * @return {String}
	 */
	get producerId()
	{
		return this._producerId;
	}

	/**
	 * Whether the consumer is closed.
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
	 * RTP parameters.
	 *
	 * @return {RTCRtpParameters}
	 */
	get rtpParameters()
	{
		return this._rtpParameters;
	}

	/**
	 * Whether the consumer is paused.
	 *
	 * @return {Boolean}
	 */
	get paused()
	{
		return this._paused;
	}

	/**
	 * Preferred spatial layer.
	 *
	 * @type {String}
	 */
	get preferredSpatialLayer()
	{
		return this._preferredSpatialLayer;
	}

	/**
	 * Set preferred spatial layer.
	 *
	 * @param {String} spatialLayer
	 */
	set preferredSpatialLayer(spatialLayer)
	{
		if (
			this._closed ||
			spatialLayer === this._preferredSpatialLayer ||
			this._track.kind !== 'video'
		)
		{
			return;
		}
		else if (!utils.isValidSpatialLayer(spatialLayer))
		{
			logger.error(
				'set preferredSpatialLayer | invalid spatialLayer "%s"', spatialLayer);

			return;
		}

		this._preferredSpatialLayer = spatialLayer;
	}

	/**
	 * Effective spatial layer.
	 *
	 * @type {String}
	 */
	get effectiveSpatialLayer()
	{
		return this._effectiveSpatialLayer;
	}

	/**
	 * Set effective spatial layer.
	 *
	 * @param {String} spatialLayer
	 */
	set effectiveSpatialLayer(spatialLayer)
	{
		if (
			this._closed ||
			spatialLayer === this._effectiveSpatialLayer ||
			this._track.kind !== 'video'
		)
		{
			return;
		}
		else if (
			!utils.isValidSpatialLayer(
				spatialLayer, { optional: true, allowDefault: true })
		)
		{
			logger.error(
				'set effectiveSpatialLayer | invalid spatialLayer "%s"', spatialLayer);

			return;
		}

		this._effectiveSpatialLayer = spatialLayer || null;
	}

	/**
	 * App custom data.
	 *
	 * @return {Object}
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
	 * Closes the consumer.
	 */
	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;
		this._effectiveSpatialLayer = null;

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

		this._closed = true;
		this._effectiveSpatialLayer = null;

		this._destroyTrack();

		this.safeEmit('transportclose');
	}

	/**
	 * Pauses receiving media.
	 */
	pause()
	{
		logger.debug('pause()');

		if (this._closed)
		{
			logger.error('pause() | consumer closed');

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
			logger.error('resume() | consumer closed');

			return;
		}

		this._paused = false;
		this._track.enabled = true;
	}

	/**
	 * Get associated RTCRtpReceiver stats.
	 *
	 * @promise
	 * @fulfill {RTCStatsReport}
	 * @reject {InvalidStateError} if consumer closed.
	 */
	getStats()
	{
		if (this._closed)
			return Promise.reject(new InvalidStateError('consumer closed'));

		return this.safeEmitAsPromise('@getstats');
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
