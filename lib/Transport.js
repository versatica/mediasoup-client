const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const { UnsupportedError, InvalidStateError } = require('./errors');
const ortc = require('./ortc');
const CommandQueue = require('./CommandQueue');
const Producer = require('./Producer');
const Consumer = require('./Consumer');

const SIMULCAST_DEFAULT =
[
	{ maxBitrate: 100000 },
	{ maxBitrate: 500000 },
	{ maxBitrate: 1500000 }
];

const logger = new Logger('Transport');

class Transport extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {transportLocalParameters: Object, callback: Function, errback: Function} connect
	 * @emits {producerLocalParameters: Object, callback: Function, errback: Function} produce
	 * @emits {connectionState: String} connectionstatechange
	 */
	constructor(
		{
			direction,
			transportRemoteParameters,
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
		// @type {Map<String, Producer>}
		this._producers = new Map();

		// Map of Consumers indexed by id.
		// @type {Map<String, Consumer>}
		this._consumers = new Map();

		// Commands handler.
		// @type {CommandQueue}
		this._commandQueue = new CommandQueue();

		this._handleHandler();
	}

	/**
	 * Transport id.
	 *
	 * @returns {String}
	 */
	get id()
	{
		return this._id;
	}

	/**
	 * Whether the Transport is closed.
	 *
	 * @returns {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * Transport direction.
	 *
	 * @returns {String}
	 */
	get direction()
	{
		return this._direction;
	}

	/**
	 * RTC handler instance.
	 *
	 * @returns {Handler}
	 */
	get handler()
	{
		return this._handler;
	}

	/**
	 * Connection state.
	 *
	 * @returns {String}
	 */
	get connectionState()
	{
		return this._connectionState;
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
	 * Close the Transport.
	 */
	close()
	{
		if (this._closed)
			return;

		logger.debug('close()');

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
	 * Get associated Transport (RTCPeerConnection) stats.
	 *
	 * @async
	 * @returns {RTCStatsReport}
	 * @throws {InvalidStateError} if Transport closed.
	 */
	async getStats()
	{
		if (this._closed)
			throw new InvalidStateError('closed');

		return this._handler.getTransportStats();
	}

	/**
	 * Restart ICE connection.
	 *
	 * @param {RTCIceParameters} remoteIceParameters
	 *
	 * @async
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 */
	async restartIce({ remoteIceParameters } = {})
	{
		logger.debug('restartIce()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (!remoteIceParameters)
			throw new TypeError('missing remoteIceParameters');

		// Enqueue command.
		return this._commandQueue.push(
			async () => this._handler.restartIce({ remoteIceParameters }));
	}

	/**
	 * Update ICE servers.
	 *
	 * @param {Array<RTCIceServer>} [iceServers] - Array of ICE servers.
	 *
	 * @async
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 */
	async updateIceServers({ iceServers } = {})
	{
		logger.debug('updateIceServers()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (!Array.isArray(iceServers))
			throw new TypeError('missing iceServers');

		// Enqueue command.
		return this._commandQueue.push(
			async () => this._handler.updateIceServers({ iceServers }));
	}

	/**
	 * Produce a track.
	 *
	 * @param {MediaStreamTrack} track - Track to sent.
	 * @param {Object|Boolean} [simulcast=true] - Simulcast options.
	 * @param {Number} [maxSpatialLayer] - Video max spatial layer to send.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {Producer}
	 * @throws {InvalidStateError} if Transport closed or track ended.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible or
	 *   cannot produce the given media kind.
	 */
	async produce({ track, simulcast = false, maxSpatialLayer, appData = {} } = {})
	{
		logger.debug('produce() [track:%o]', track);

		if (!track)
			throw new TypeError('missing track');
		else if (this._direction !== 'send')
			throw new UnsupportedError('not a sending Transport');
		else if (!this._canProduceByKind[track.kind])
			throw new UnsupportedError(`cannot produce ${track.kind}`);
		else if (track.readyState === 'ended')
			throw new InvalidStateError('track ended');
		else if (maxSpatialLayer !== undefined && typeof maxSpatialLayer !== 'number')
			throw new TypeError('invalid maxSpatialLayer');
		else if (typeof maxSpatialLayer === 'number' && track.kind === 'audio')
			throw new TypeError('cannot set maxSpatialLayer with audio track');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._commandQueue.push(
			async () =>
			{
				let normalizedSimulcast;

				if (!simulcast || track.kind !== 'video')
				{
					normalizedSimulcast = false;
				}
				else if (simulcast === true)
				{
					normalizedSimulcast = SIMULCAST_DEFAULT;
				}
				else if (Array.isArray(simulcast) && simulcast.length > 1)
				{
					normalizedSimulcast = simulcast
						.map((entry) =>
						{
							if (!entry || entry.maxBitrate !== 'number')
								throw TypeError('invalid simulcast entry');

							return { maxBitrate: entry.maxBitrate };
						});
				}
				else
				{
					throw new TypeError('invalid simulcast');
				}

				const rtpParameters =
					await this._handler.send({ track, simulcast: normalizedSimulcast });

				if (typeof maxSpatialLayer === 'number')
				{
					try
					{
						await this._handler.setMaxSpatialLayer(
							{ track, spatialLayer: maxSpatialLayer });
					}
					catch (error)
					{
						maxSpatialLayer = undefined; // Be flexible.
					}
				}

				try
				{
					const producerRemoteParameters = await this.safeEmitAsPromise(
						'produce',
						// producerLocalParameters.
						{
							kind : track.kind,
							rtpParameters,
							appData
						});

					const producer = new Producer(
						{
							id : producerRemoteParameters.id,
							track,
							rtpParameters,
							maxSpatialLayer,
							appData
						});

					this._producers.set(producer.id, producer);
					this._handleProducer(producer);

					return producer;
				}
				catch (error)
				{
					this._handler.stopSending({ track })
						.catch(() => {});

					throw error;
				}
			})
			// This catch is needed to stop the given track if the command above
			// failed due to closed Transport.
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
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {Consumer}
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible.
	 */
	async consume({ consumerRemoteParameters, appData = {} } = {})
	{
		logger.debug('consume()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (this._direction !== 'recv')
			throw new UnsupportedError('not a receiving Transport');
		else if (typeof consumerRemoteParameters !== 'object')
			throw new TypeError('missing consumerRemoteParameters');
		else if (!consumerRemoteParameters.id)
			throw new TypeError('missing consumerRemoteParameters.id');
		else if (!consumerRemoteParameters.producerId)
			throw new TypeError('missing consumerRemoteParameters.producerId');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._commandQueue.push(
			async () =>
			{
				// Ensure the device can consume it.
				const canConsume = ortc.canReceive(
					consumerRemoteParameters.rtpParameters, this._extendedRtpCapabilities);

				if (!canConsume)
					throw new UnsupportedError('cannot consume this Producer');

				const track = await this._handler.receive(
					{
						id            : consumerRemoteParameters.id,
						kind          : consumerRemoteParameters.kind,
						rtpParameters : consumerRemoteParameters.rtpParameters
					});

				const consumer = new Consumer(
					{
						id            : consumerRemoteParameters.id,
						producerId    : consumerRemoteParameters.producerId,
						track,
						rtpParameters : consumerRemoteParameters.rtpParameters,
						appData
					});

				this._consumers.set(consumer.id, consumer);
				this._handleConsumer(consumer);

				return consumer;
			});
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('@connect', (transportLocalParameters, callback, errback) =>
		{
			if (this._closed)
			{
				errback(new InvalidStateError('closed'));

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
				async () => this._handler.stopSending({ track: producer.track }))
				.catch(() => {});
		});

		producer.on('@replacetrack', (newTrack, callback, errback) =>
		{
			this._commandQueue.push(
				async () => this._handler.replaceTrack({ track: producer.track, newTrack }))
				.then(callback)
				.catch(errback);
		});

		producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) =>
		{
			this._commandQueue.push(
				async () => (
					this._handler.setMaxSpatialLayer({ track: producer.track, spatialLayer })
				))
				.then(callback)
				.catch(errback);
		});

		producer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('closed'));

			try
			{
				this._handler.getSenderStats({ track: producer.track })
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
				async () => this._handler.stopReceiving({ id: consumer.id }))
				.catch(() => {});
		});

		consumer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('closed'));

			try
			{
				this._handler.getReceiverStats({ id: consumer.id })
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
