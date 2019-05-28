const AwaitQueue = require('awaitqueue');
const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const { UnsupportedError, InvalidStateError } = require('./errors');
const ortc = require('./ortc');
const Producer = require('./Producer');
const Consumer = require('./Consumer');

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
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
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

		logger.debug('constructor() [id:%s, direction:%s]', id, direction);

		// Id.
		// @type {String}
		this._id = id;

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
				direction,
				iceParameters,
				iceCandidates,
				dtlsParameters,
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

		// AwaitQueue instance to make async tasks happen sequentially.
		// @type {AwaitQueue}
		this._awaitQueue = new AwaitQueue({ ClosedErrorClass: InvalidStateError });

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

		// Close the AwaitQueue.
		this._awaitQueue.close();

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
	 * @param {RTCIceParameters} iceParameters - New Server-side Transport ICE parameters.
	 *
	 * @async
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 */
	async restartIce({ iceParameters } = {})
	{
		logger.debug('restartIce()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (!iceParameters)
			throw new TypeError('missing iceParameters');

		// Enqueue command.
		return this._awaitQueue.push(
			async () => this._handler.restartIce({ iceParameters }));
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
		return this._awaitQueue.push(
			async () => this._handler.updateIceServers({ iceServers }));
	}

	/**
	 * Produce a track.
	 *
	 * @param {MediaStreamTrack} track - Track to sent.
	 * @param {Array<RTCRtpCodingParameters>} [encodings] - Encodings.
	 * @param {Object} [codecOptions] - Codec options.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {Producer}
	 * @throws {InvalidStateError} if Transport closed or track ended.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible or
	 *   cannot produce the given media kind.
	 */
	async produce(
		{
			track,
			encodings,
			codecOptions,
			appData = {}
		} = {}
	)
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
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._awaitQueue.push(
			async () =>
			{
				let normalizedEncodings;

				if (encodings && !Array.isArray(encodings))
				{
					throw TypeError('encodings must be an array');
				}
				else if (encodings && encodings.length === 0)
				{
					normalizedEncodings = undefined;
				}
				else if (encodings)
				{
					normalizedEncodings = encodings
						.map((encoding) =>
						{
							const normalizedEncoding = { active: true };

							if (encoding.active === false)
								normalizedEncoding.active = false;
							if (typeof encoding.maxBitrate === 'number')
								normalizedEncoding.maxBitrate = encoding.maxBitrate;
							if (typeof encoding.maxFramerate === 'number')
								normalizedEncoding.maxFramerate = encoding.maxFramerate;
							if (typeof encoding.scaleResolutionDownBy === 'number')
								normalizedEncoding.scaleResolutionDownBy = encoding.scaleResolutionDownBy;
							if (typeof encoding.dtx === 'boolean')
								normalizedEncoding.dtx = encoding.dtx;
							if (typeof encoding.scalabilityMode === 'string')
								normalizedEncoding.scalabilityMode = encoding.scalabilityMode;

							return normalizedEncoding;
						});
				}

				const { localId, rtpParameters } = await this._handler.send(
					{
						track,
						encodings : normalizedEncodings,
						codecOptions
					});

				try
				{
					const { id } = await this.safeEmitAsPromise(
						'produce',
						{
							kind : track.kind,
							rtpParameters,
							appData
						});

					const producer =
						new Producer({ id, localId, track, rtpParameters, appData });

					this._producers.set(producer.id, producer);
					this._handleProducer(producer);

					return producer;
				}
				catch (error)
				{
					this._handler.stopSending({ localId })
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
	 * @param {String} id - Server-side Consumer id.
	 * @param {String} producerId - Server-side Producer id.
	 * @param {String} kind - 'audio' or 'video'.
	 * @param {RTCRtpParameters} rtpParameters - Server-side Consumer RTP parameters.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @async
	 * @returns {Consumer}
	 * @throws {InvalidStateError} if Transport closed.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {UnsupportedError} if Transport direction is incompatible.
	 */
	async consume(
		{
			id,
			producerId,
			kind,
			rtpParameters,
			appData = {}
		} = {})
	{
		logger.debug('consume()');

		if (this._closed)
			throw new InvalidStateError('closed');
		else if (this._direction !== 'recv')
			throw new UnsupportedError('not a receiving Transport');
		else if (typeof id !== 'string')
			throw new TypeError('missing id');
		else if (typeof producerId !== 'string')
			throw new TypeError('missing producerId');
		else if (kind !== 'audio' && kind !== 'video')
			throw new TypeError(`invalid kind "${kind}"`);
		else if (typeof rtpParameters !== 'object')
			throw new TypeError('missing rtpParameters');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Enqueue command.
		return this._awaitQueue.push(
			async () =>
			{
				// Ensure the device can consume it.
				const canConsume = ortc.canReceive(
					rtpParameters, this._extendedRtpCapabilities);

				if (!canConsume)
					throw new UnsupportedError('cannot consume this Producer');

				const { localId, track } =
					await this._handler.receive({ id, kind, rtpParameters });

				const consumer =
					new Consumer({ id, localId, producerId, track, rtpParameters, appData });

				this._consumers.set(consumer.id, consumer);
				this._handleConsumer(consumer);

				return consumer;
			});
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('@connect', ({ dtlsParameters }, callback, errback) =>
		{
			if (this._closed)
			{
				errback(new InvalidStateError('closed'));

				return;
			}

			this.safeEmit('connect', { dtlsParameters }, callback, errback);
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

			this._awaitQueue.push(
				async () => this._handler.stopSending({ localId: producer.localId }))
				.catch((error) => logger.warn('producer.close() failed:%o', error));
		});

		producer.on('@replacetrack', (track, callback, errback) =>
		{
			this._awaitQueue.push(
				async () => this._handler.replaceTrack({ localId: producer.localId, track }))
				.then(callback)
				.catch(errback);
		});

		producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) =>
		{
			this._awaitQueue.push(
				async () => (
					this._handler.setMaxSpatialLayer({ localId: producer.localId, spatialLayer })
				))
				.then(callback)
				.catch(errback);
		});

		producer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('closed'));

			this._handler.getSenderStats({ localId: producer.localId })
				.then(callback)
				.catch(errback);
		});
	}

	_handleConsumer(consumer)
	{
		consumer.on('@close', () =>
		{
			this._consumers.delete(consumer.id);

			if (this._closed)
				return;

			this._awaitQueue.push(
				async () => this._handler.stopReceiving({ localId: consumer.localId }))
				.catch(() => {});
		});

		consumer.on('@getstats', (callback, errback) =>
		{
			if (this._closed)
				return errback(new InvalidStateError('closed'));

			this._handler.getReceiverStats({ localId: consumer.localId })
				.then(callback)
				.catch(errback);
		});
	}
}

module.exports = Transport;
