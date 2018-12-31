const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const utils = require('./utils');
const ortc = require('./ortc');
const { UnsupportedError, InvalidStateError } = require('./errors');
const CommandQueue = require('./CommandQueue');
const Producer = require('./Producer');
const Consumer = require('./Consumer');

const SIMULCAST_DEFAULT =
{
	low    : 100000,
	medium : 500000,
	high   : 1500000
};

const logger = new Logger('Transport');

class Transport extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {transportLocalParameters: Object, callback: Function, errback: Function} connect
	 * @emits {producerLocalParameters: Object, callback: Function, errback: Function} produce
	 * @emits {consumerId: String} startConsumer
	 * @emits {connectionState: String} connectionstatechange
	 */
	constructor(
		{
			transportRemoteParameters,
			direction,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			appData,
			Handler,
			extendedRtpCapabilities,
			canProduceByKind
		}
	)
	{
		super(logger);

		logger.debug(
			'constructor() [id:%s, direction:%s]',
			transportRemoteParameters.id, direction);

		// Id.
		// @type {String}
		this._id = transportRemoteParameters.id;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Direction.
		// @type {String}
		this._direction = direction;

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = extendedRtpCapabilities;

		// Whether we can produce audio/video based on computed extended RTP
		// capabilities.
		// @type {Object}
		this._canProduceByKind = canProduceByKind;

		// RTC handler instance.
		// @type {Handler}
		this._handler = new Handler(
			{
				transportRemoteParameters,
				direction,
				iceServers,
				iceTransportPolicy,
				proprietaryConstraints,
				extendedRtpCapabilities
			});

		// Transport connection state. Values can be:
		// 'new'/'connecting'/'connected'/'failed'/'disconnected'/'closed'
		// @type {String}
		this._connectionState = 'new';

		// App custom data.
		// @type {Object}
		this._appData = appData;

		// Map of Producers indexed by id.
		// @type {map<String, Producer>}
		this._producers = new Map();

		// Map of Consumers indexed by id.
		// @type {map<String, Consumer>}
		this._consumers = new Map();

		// Commands handler.
		// @type {CommandQueue}
		this._commandQueue = new CommandQueue();

		this._handleHandler();
	}

	/**
	 * Transport id.
	 *
	 * @return {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the Transport is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * Transport direction.
	 *
	 * @return {String}
	 */
	get direction()
	{
		return this._direction;
	}

	/**
	 * RTC handler instance.
	 *
	 * @return {Handler}
	 */
	get handler()
	{
		return this._handler;
	}

	/**
	 * Connection state.
	 *
	 * @return {String}
	 */
	get connectionState()
	{
		return this._connectionState;
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
		throw new Error('cannot overwrite appData object');
	}

	/**
	 * Close the Transport.
	 */
	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		// Close the CommandQueue.
		this._commandQueue.close();

		// Close the handler.
		this._handler.close();

		// Close all Producers.
		for (const producer of this._producers.values())
		{
			producer.transportClosed();
		}
		this._producers.clear();

		// Close all Consumers.
		for (const consumer of this._consumers.values())
		{
			consumer.transportClosed();
		}
		this._consumers.clear();
	}

	/**
	 * Produce a track.
	 *
	 * @param {MediaStreamTrack} track - Track to sent.
	 * @param {Object|Boolean} [simulcast] - Simulcast options.
	 * @param {String} [maxSpatialLayer]
	 * @param {Object} [appData] - Custom app data.
	 *
	 * @promise
	 * @fulfill {Producer}
	 * @reject {InvalidStateError} if Transport closed or track ended.
	 * @reject {TypeError} if wrong arguments.
	 * @reject {UnsupportedError} if Transport direction is incompatible or
	 *   cannot produce the given media kind.
	 */
	produce({ track, simulcast, maxSpatialLayer, appData } = {})
	{
		logger.debug('produce() [track:%o]', track);

		if (!track)
			return Promise.reject(new TypeError('missing track'));
		else if (this._direction !== 'send')
			return Promise.reject(new UnsupportedError('not a sending Transport'));
		else if (!this._canProduceByKind[track.kind])
			return Promise.reject(new UnsupportedError(`cannot produce ${track.kind}`));
		else if (track.readyState === 'ended')
			return Promise.reject(new InvalidStateError('track ended'));
		else if (!utils.isValidSpatialLayer(maxSpatialLayer, { optional: true }))
			return Promise.reject(new TypeError('invalid maxSpatialLayer'));
		else if (maxSpatialLayer && track.kind === 'audio')
			return Promise.reject(new TypeError('cannot set maxSpatialLayer with audio track'));
		else if (appData && typeof appData !== 'object')
			return Promise.reject(new TypeError('if given, appData must be an object'));

		appData = appData || {};

		// Enqueue command.
		return this._commandQueue.push(
			() =>
			{
				let normalizedSimulcast;

				if (!simulcast || track.kind !== 'video')
				{
					normalizedSimulcast = false;
				}
				else if (simulcast === true)
				{
					normalizedSimulcast = utils.clone(SIMULCAST_DEFAULT);
				}
				else if (typeof simulcast === 'object')
				{
					const hasLow = typeof simulcast.low === 'number';
					const hasMedium = typeof simulcast.medium === 'number';
					const hasHigh = typeof simulcast.high === 'number';

					if (Number(hasLow) + Number(hasMedium) + Number(hasHigh) > 1)
					{
						normalizedSimulcast = {};

						if (hasLow)
							normalizedSimulcast.low = simulcast.low;
						if (hasMedium)
							normalizedSimulcast.medium = simulcast.medium;
						if (hasHigh)
							normalizedSimulcast.high = simulcast.high;
					}
					else
					{
						normalizedSimulcast = false;
					}
				}

				let trackHandled = false;
				let producerRtpParameters;

				return Promise.resolve()
					.then(() => this._handler.send({ track, simulcast: normalizedSimulcast }))
					.then((rtpParameters) =>
					{
						if (maxSpatialLayer && maxSpatialLayer !== 'high')
						{
							return this._handler.setMaxSpatialLayer(
								{ track, spatialLayer: maxSpatialLayer })
								.catch(() => (maxSpatialLayer = null)) // Be flexible.
								.then(() => rtpParameters);
						}

						return rtpParameters;
					})
					.then((rtpParameters) =>
					{
						trackHandled = true;
						producerRtpParameters = rtpParameters;

						return this.safeEmitAsPromise(
							'produce',
							// producerLocalParameters.
							{
								kind : track.kind,
								rtpParameters,
								appData
							});
					})
					.then((producerRemoteParameters) =>
					{
						if (!maxSpatialLayer)
							maxSpatialLayer = (track.kind === 'video') ? 'high' : null;

						const producer = new Producer(
							{
								id            : producerRemoteParameters.id,
								track,
								rtpParameters : producerRtpParameters,
								maxSpatialLayer,
								appData
							});

						this._producers.set(producer.id, producer);
						this._handleProducer(producer);

						return producer;
					})
					.catch((error) =>
					{
						if (trackHandled)
						{
							this._handler.stopSending({ track })
								.catch(() => {});
						}

						throw error;
					});
			})
			.catch((error) =>
			{
				try { track.stop(); }
				catch (error2) {}

				throw error;
			});
	}

	/**
	 * Consume a remote Producer.
	 *
	 * @param {String} consumerRemoteParameters - Server-side Consumer parameters.
	 * @param {Object} [appData] - Custom app data.
	 *
	 * @promise
	 * @fulfill {Consumer}
	 * @reject {InvalidStateError} if Transport closed.
	 * @reject {TypeError} if wrong arguments.
	 * @reject {UnsupportedError} if Transport direction is incompatible.
	 */
	consume({ consumerRemoteParameters, appData } = {})
	{
		logger.debug('consume()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('closed'));
		else if (this._direction !== 'recv')
			return Promise.reject(new UnsupportedError('not a receiving Transport'));
		else if (typeof consumerRemoteParameters !== 'object')
			return Promise.reject(new TypeError('missing consumerRemoteParameters'));
		else if (!consumerRemoteParameters.id)
			return Promise.reject(new TypeError('missing consumerRemoteParameters.id'));
		else if (!consumerRemoteParameters.producerId)
			return Promise.reject(new TypeError('missing consumerRemoteParameters.producerId'));
		else if (appData && typeof appData !== 'object')
			return Promise.reject(new TypeError('if given, appData must be an object'));

		appData = appData || {};

		// Enqueue command.
		return this._commandQueue.push(
			() =>
			{
				let consumerParameters;

				return Promise.resolve()
					.then(() =>
					{
						consumerParameters = consumerRemoteParameters;

						// Ensure the device can consume it.
						const canConsume = ortc.canReceive(
							consumerParameters.rtpParameters, this._extendedRtpCapabilities);

						if (!canConsume)
							throw new UnsupportedError('cannot consume this Producer');

						return this._handler.receive(
							{
								id            : consumerParameters.id,
								kind          : consumerParameters.kind,
								rtpParameters : consumerParameters.rtpParameters
							});
					})
					.then((track) =>
					{
						const consumer = new Consumer(
							{
								id            : consumerParameters.id,
								producerId    : consumerParameters.producerId,
								track,
								rtpParameters : consumerParameters.rtpParameters,
								appData
							});

						this._consumers.set(consumer.id, consumer);
						this._handleConsumer(consumer);

						// Tell the app to start the server-side Consumer now.
						this.safeEmit('startConsumer', consumer.id);

						return consumer;
					});
			});
	}

	/**
	 * Get associated Transport (RTCPeerConnection) stats.
	 *
	 * @promise
	 * @fulfill {RTCStatsReport}
	 * @reject {InvalidStateError} if Transport closed.
	 */
	getStats()
	{
		if (this._closed)
			return Promise.reject(new InvalidStateError('closed'));

		try
		{
			return this._handler.getTransportStats();
		}
		catch (error)
		{
			return Promise.reject(error);
		}
	}

	/**
	 * Restart ICE connection.
	 *
	 * @param {RTCIceParameters} remoteIceParameters
	 *
	 * @promise
	 * @reject {InvalidStateError} if Transport closed.
	 * @reject {TypeError} if wrong arguments.
	 */
	restartIce({ remoteIceParameters } = {})
	{
		logger.debug('restartIce()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('closed'));
		else if (!remoteIceParameters)
			return Promise.reject(new TypeError('missing remoteIceParameters'));

		// Enqueue command.
		return this._commandQueue.push(
			() => this._handler.restartIce({ remoteIceParameters }));
	}

	/**
	 * Update ICE servers.
	 *
	 * @param {Array<RTCIceServer>} [iceServers] - Array of ICE servers.
	 *
	 * @promise
	 * @reject {InvalidStateError} if Transport closed.
	 * @reject {TypeError} if wrong arguments.
	 */
	updateIceServers({ iceServers } = {})
	{
		logger.debug('updateIceServers()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('closed'));
		else if (!Array.isArray(iceServers))
			return Promise.reject(new TypeError('missing iceServers'));

		// Enqueue command.
		return this._commandQueue.push(
			() => this._handler.updateIceServers({ iceServers }));
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('@connect', (transportLocalParameters, callback, errback) =>
		{
			if (this._closed)
			{
				errback(new InvalidStateError(''));

				return;
			}

			transportLocalParameters.id = this._id;

			this.safeEmit('connect', transportLocalParameters, callback, errback);
		});

		handler.on('@connectionstatechange', (connectionState) =>
		{
			if (connectionState === this._connectionState)
				return;

			logger.debug('connection state changed to %s', connectionState);

			this._connectionState = connectionState;

			if (!this._closed)
				this.safeEmit('connectionstatechange', connectionState);
		});
	}

	_handleProducer(producer)
	{
		producer.on('@close', () =>
		{
			this._producers.delete(producer.id);

			if (this._closed)
				return;

			this._commandQueue.push(
				() => this._handler.stopSending({ track: producer.track }))
				.catch(() => {});
		});

		producer.on('@replacetrack', (newTrack, callback, errback) =>
		{
			this._commandQueue.push(
				() => this._handler.replaceTrack({ track: producer.track, newTrack }))
				.then(callback)
				.catch(errback);
		});

		producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) =>
		{
			this._commandQueue.push(
				() => this._handler.setMaxSpatialLayer({ track: producer.track, spatialLayer }))
				.then(callback)
				.catch(errback);
		});

		producer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('transport closed'));

			try
			{
				return this._handler.getSenderStats({ track: producer.track })
					.then(callback)
					.catch(errback);
			}
			catch (error)
			{
				errback(error);
			}
		});
	}

	_handleConsumer(consumer)
	{
		consumer.on('@close', () =>
		{
			this._consumers.delete(consumer.id);

			if (this._closed)
				return;

			this._commandQueue.push(
				() => this._handler.stopReceiving({ id: consumer.id }))
				.catch(() => {});
		});

		consumer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('transport closed'));

			try
			{
				return this._handler.getReceiverStats({ id: consumer.id })
					.then(callback)
					.catch(errback);
			}
			catch (error)
			{
				errback(error);
			}
		});
	}
}

module.exports = Transport;
