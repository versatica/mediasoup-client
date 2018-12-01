import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import CommandQueue from './CommandQueue';
import Producer from './Producer';
import Consumer from './Consumer';

const SIMULCAST_DEFAULT =
{
	low    : 100000,
	medium : 300000,
	high   : 1500000
};

const logger = new Logger('Transport');

export default class Transport extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {parameters: Object, callback: Function, errback: Function} localparameters
	 * @emits {state: String} connectionstatechange
	 */
	constructor(
		{
			remoteTransportData,
			direction,
			turnServers,
			iceTransportPolicy,
			Handler,
			extendedRtpCapabilities,
			recvRtpCapabilities,
			canSendByKind
		}
	)
	{
		super(logger);

		logger.debug(
			'constructor() [id:%s, direction:%s]', remoteTransportData.id, direction);

		// Id.
		// @type {String}
		this._id = remoteTransportData.id;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Direction.
		// @type {String}
		this._direction = direction;

		// Local RTP capabilities for receiving media.
		// @type {RTCRtpCapabilities}
		this._recvRtpCapabilities = recvRtpCapabilities;

		// Whether we can send audio/video based on computed extended RTP
		// capabilities.
		// @type {Object}
		this._canSendByKind = canSendByKind;

		// RTC handler instance.
		this._handler = new Handler(
			{
				remoteTransportData,
				direction,
				turnServers,
				iceTransportPolicy,
				extendedRtpCapabilities
			});

		// Transport state. Values can be:
		// 'new'/'connecting'/'connected'/'failed'/'disconnected'/'closed'
		// @type {String}
		this._connectionState = 'new';

		// Map of producers indexed by id.
		// @type {map<String, Producer>}
		this._producers = new Map();

		// Map of consumers indexed by id.
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

		// Close all the producers.
		for (const producer of this._producers.values())
		{
			producer.transportClosed();
		}
		this._producers.clear();

		// Close all the consumers.
		for (const consumer of this._consumers.values())
		{
			consumer.transportClosed();
		}
		this._consumers.clear();
	}

	/**
	 * Send a track.
	 *
	 * @param {MediaStreamTrack} track - Track to sent.
	 * @param {Object|Boolean} [simulcast] - Simulcast options.
	 * @param {Any} [appData] - Custom app data.
	 *
	 * @return {Promise} Resolves with a new Producer.
	 */
	send({ track, simulcast, appData } = {})
	{
		logger.debug('send() [track:%o]', track);

		if (this._closed)
			return Promise.reject(new InvalidStateError('transport closed'));
		else if (!track)
			return Promise.reject(new TypeError('missing track'));
		else if (this._direction !== 'send')
			return Promise.reject(new UnsupportedError('not a sending transport'));
		else if (!this._canSendByKind[track.kind])
			return Promise.reject(new UnsupportedError(`cannot send ${track.kind}`));

		// Enqueue command.
		return this._commandQueue.push(
			() =>
			{
				if (typeof simulcast === 'object')
					simulcast = Object.assign({}, SIMULCAST_DEFAULT, simulcast);
				else if (simulcast === true)
					simulcast = Object.assign({}, SIMULCAST_DEFAULT);

				// Clone the track.
				try { track = track.clone(); }
				catch (error) {}

				let producerHandled = false;
				let producerRtpParameters;

				return Promise.resolve()
					.then(() => this._handler.send({ track, simulcast }))
					.then((rtpParameters) =>
					{
						producerHandled = true;
						producerRtpParameters = rtpParameters;

						return this.safeEmitAsPromise(
							'send',
							{
								kind : track.kind,
								rtpParameters,
								appData
							});
					})
					.then((producerId) =>
					{
						const producer = new Producer(
							{
								id            : producerId,
								track,
								rtpParameters : producerRtpParameters,
								appData
							});

						this._producers.set(producer.id, producer);
						this._handleProducer(producer);

						return producer;
					})
					.catch((error) =>
					{
						if (producerHandled)
						{
							this._handler.stopSending({ track })
								.catch(() => {});
						}

						throw error;
					});
			});
	}

	/**
	 * Receive a track.
	 *
	 * @param {String} producerId - Server-side producer id..
	 * @param {Any} [appData] - Custom app data.
	 *
	 * @return {Promise} Resolves with a new Consumer.
	 */
	receive({ producerId, appData } = {})
	{
		logger.debug('receive()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('transport closed'));
		else if (!producerId)
			throw new TypeError('missing producerId');
		else if (this._direction !== 'recv')
			return Promise.reject(new UnsupportedError('not a receiving transport'));

		let consumerData;

		// Enqueue command.
		return this._commandQueue.push(
			() =>
			{
				return Promise.resolve()
					.then(() =>
					{
						return this.safeEmitAsPromise(
							'receive',
							{
								producerId,
								rtpCapabilities : this._recvRtpCapabilities,
								appData
							});
					})
					.then((remoteConsumerData) =>
					{
						consumerData = remoteConsumerData;

						return this._handler.receive(
							{
								id            : consumerData.id,
								kind          : consumerData.kind,
								rtpParameters : consumerData.rtpParameters
							});
					})
					.then((track) =>
					{
						const consumer = new Consumer(
							{
								id            : consumerData.id,
								track,
								rtpParameters : consumerData.rtpParameters,
								appData
							});

						this._consumers.set(consumer.id, consumer);
						this._handleConsumer(consumer);

						return consumer;
					});
			});
	}

	/**
	 * Restart ICE connection.
	 *
	 * @param {RTCIceParameters} remoteIceParameters
	 *
	 * @return {Promise}
	 */
	restartIce({ remoteIceParameters } = {})
	{
		logger.debug('restartIce()');

		if (this._closed || this._connectionState === 'new')
			return Promise.resolve();
		else if (!remoteIceParameters)
			return Promise.reject(new TypeError('missing remoteIceParameters'));

		// Enqueue command.
		return this._commandQueue.push(
			() => this._handler.restartIce(remoteIceParameters));
	}

	// TODO
	_handleHandler()
	{
		const handler = this._handler;

		handler.on('@connectionstatechange', (connectionState) =>
		{
			if (connectionState === this._connectionState)
				return;

			logger.debug('transport connection state changed to %s', connectionState);

			this._connectionState = connectionState;

			if (!this._closed)
				this.safeEmit('connectionstatechange', connectionState);
		});

		handler.on('@localparameters', (parameters, callback, errback) =>
		{
			this.safeEmit('localparameters', parameters, callback, errback);
		});

		handler.on('@needupdatetransport', (transportLocalParameters) =>
		{
			const data =
			{
				id : this._id
			};

			if (transportLocalParameters)
			{
				if (transportLocalParameters.dtlsParameters)
					data.dtlsParameters = transportLocalParameters.dtlsParameters;
				else if (transportLocalParameters.plainRtpParameters)
					data.plainRtpParameters = transportLocalParameters.plainRtpParameters;
			}

			this.safeEmit('@notify', 'updateTransport', data);
		});

		handler.on('@needupdateproducer', (producer, rtpParameters) =>
		{
			const data =
			{
				id            : producer.id,
				rtpParameters : rtpParameters
			};

			// Update producer RTP parameters.
			producer.setRtpParameters(rtpParameters);

			// Notify the server.
			this.safeEmit('@notify', 'updateProducer', data);
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
			// Clone the track.
			try { newTrack = newTrack.clone(); }
			catch (error) {}

			this._commandQueue.push(
				() => this._handler.replaceTrack({ track: producer.track, newTrack }))
				.then(() => callback(newTrack))
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

			this._commandQueue.push(
				() => this._handler.stopReceiving({ id: consumer.id }))
				.catch(() => {});
		});
	}
}
