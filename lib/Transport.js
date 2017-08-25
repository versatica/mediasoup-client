import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as utils from './utils';
import Device from './Device';
import CommandQueue from './CommandQueue';

const logger = new Logger('Transport');

export default class Transport extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {state: String} connectionstatechange
	 * @emits {originator: String, [appData]: Any} close
	 *
	 * @emits {method: String, [data]: Object, callback: Function, errback: Function} @request
	 * @emits {method: String, [data]: Object} @notify
	 * @emits {originator: String} @close
	 */
	constructor(direction, extendedRtpCapabilities, settings, appData)
	{
		super(logger);

		logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		// Id.
		// @type {Number}
		this._id = utils.randomNumber();

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Direction.
		// @type {String}
		this._direction = direction;

		// Room settings.
		// @type {Object}
		this._settings = settings;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Map of Producers indexed by id.
		// @type {map<Number, Producer>}
		this._producers = new Map();

		// Map of Consumers indexed by id.
		// @type {map<Number, Consumer>}
		this._consumers = new Map();

		// Commands handler.
		// @type {CommandQueue}
		this._commandQueue = new CommandQueue();

		// Device specific handler.
		this._handler = new Device.Handler(direction, extendedRtpCapabilities, settings);

		// Transport state. Values can be:
		// 'new'/'connecting'/'connected'/'failed'/'disconnected'/'closed'
		// @type {String}
		this._connectionState = 'new';

		this._commandQueue.on('exec', this._execCommand.bind(this));
		this._handleHandler();
	}

	/**
	 * Transport id.
	 *
	 * @return {Number}
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
	 * App custom data.
	 *
	 * @return {Any}
	 */
	get appData()
	{
		return this._appData;
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
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		this.safeEmit(
			'@notify', 'closeTransport', { id: this._id, appData });

		this.emit('@close', 'local');
		this.safeEmit('close', 'local', appData);

		this._destroy();
	}

	/**
	 * My remote Transport was closed.
	 * Invoked via remote notification.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close', 'remote');
		this.safeEmit('close', 'remote', appData);

		this._destroy();
	}

	_destroy()
	{
		// Close the CommandQueue.
		this._commandQueue.close();

		// Close the handler.
		this._handler.close();

		// Unhandle all the Producers.
		for (const producer of this._producers.values())
		{
			producer.setHandled(false);
		}

		// Unhandle all the Consumers.
		for (const consumer of this._consumers.values())
		{
			consumer.setHandled(false);
		}
	}

	/**
	 * Send the given Producer over this Transport.
	 *
	 * @param {Producer} producer
	 *
	 * @return {Promise}
	 *
	 * @example
	 * transport.send(videoProducer)
	 *   .then(() => {
	 *     // Done
	 *   });
	 */
	send(producer)
	{
		logger.debug('send() [producer:%o]', producer);

		if (this._direction !== 'send')
			return Promise.reject(new Error('cannot send on a receiving Transport'));
		else if (!producer || producer.klass !== 'Producer')
			return Promise.reject(new TypeError('wrong Producer'));

		// Enqueue command.
		return this._commandQueue.push('addProducer', { producer });
	}

	/**
	 * Receive the given Consumer over this Transport.
	 *
	 * @param {Consumer} consumer
	 *
	 * @return {Promise}
	 *
	 * @example
	 * transport.receive(aliceVideoConsumer)
	 *   .then(() => {
	 *     // Done
	 *   });
	 */
	receive(consumer)
	{
		logger.debug('receive() [consumer:%o]', consumer);

		if (this._direction !== 'recv')
			return Promise.reject(new Error('cannot receive on a sending Transport'));
		else if (!consumer || consumer.klass !== 'Consumer')
			return Promise.reject(new TypeError('wrong Consumer'));

		// Enqueue command.
		return this._commandQueue.push('addConsumer', { consumer });
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('@connectionstatechange', (state) =>
		{
			if (this._connectionState === state)
				return;

			logger.debug('Transport connection state changed to %s', state);

			this._connectionState = state;

			if (!this._closed)
				this.safeEmit('connectionstatechange', state);
		});

		handler.on(
			'@needcreatetransport',
			(transportLocalParameters, callback, errback) =>
			{
				const data =
				{
					id      : this._id,
					options : this._settings.transportOptions,
					appData : this._appData
				};

				if (transportLocalParameters)
					data.dtlsParameters = transportLocalParameters.dtlsParameters;

				this.safeEmit('@request', 'createTransport', data, callback, errback);
			});

		handler.on('@needupdatetransport', (transportLocalParameters) =>
		{
			const data =
			{
				id             : this._id,
				dtlsParameters : transportLocalParameters.dtlsParameters
			};

			this.safeEmit('@notify', 'updateTransport', data);
		});

		handler.on('@needupdateproducer', (producer, rtpParameters) =>
		{
			const data =
			{
				id            : producer.id,
				rtpParameters : rtpParameters,
				paused        : producer.locallyPaused
			};

			// Update Producer RTP parameters.
			producer.updateRtpParameters(rtpParameters);

			// Notify the server.
			this.safeEmit('@notify', 'updateProducer', data);
		});
	}

	_execCommand(command, promiseHolder)
	{
		let promise;

		try
		{
			switch (command.method)
			{
				case 'addProducer':
				{
					const { producer } = command;

					promise = this._execAddProducer(producer);
					break;
				}

				case 'removeProducer':
				{
					const { producer } = command;

					promise = this._execRemoveProducer(producer);
					break;
				}

				case 'replaceProducerTrack':
				{
					const { producer, track } = command;

					promise = this._execReplaceProducerTrack(producer, track);
					break;
				}

				case 'addConsumer':
				{
					const { consumer } = command;

					promise = this._execAddConsumer(consumer);
					break;
				}

				case 'removeConsumer':
				{
					const { consumer } = command;

					promise = this._execRemoveConsumer(consumer);
					break;
				}

				default:
				{
					promise = Promise.reject(
						new Error(`unknown command method "${command.method}"`));
				}
			}
		}
		catch (error)
		{
			promise = Promise.reject(error);
		}

		// Fill the given Promise holder.
		promiseHolder.promise = promise;
	}

	_execAddProducer(producer)
	{
		logger.debug('_execAddProducer()');

		if (producer.closed)
			return Promise.reject(new Error('Producer closed'));
		else if (producer.handled)
			return Promise.reject(new Error('Producer already handled by a Transport'));

		let producerRtpParameters;

		producer.setHandled('tmp');

		// Call the handler.
		return Promise.resolve()
			.then(() =>
			{
				return this._handler.addProducer(producer);
			})
			.then((rtpParameters) =>
			{
				producerRtpParameters = rtpParameters;

				const data =
				{
					id            : producer.id,
					kind          : producer.kind,
					transportId   : this._id,
					rtpParameters : rtpParameters,
					paused        : producer.locallyPaused,
					appData       : producer.appData
				};

				return this.safeEmitAsPromise('@request', 'createProducer', data);
			})
			.then(() =>
			{
				producer.setHandled(true, producerRtpParameters);
				this._producers.set(producer.id, producer);
				this._handleProducer(producer);
			})
			.catch((error) =>
			{
				producer.setHandled(false);

				throw error;
			});
	}

	_execRemoveProducer(producer)
	{
		logger.debug('_execRemoveProducer()');

		// Call the handler.
		return this._handler.removeProducer(producer);
	}

	_execReplaceProducerTrack(producer, track)
	{
		logger.debug('_execReplaceProducerTrack()');

		// Call the handler.
		return this._handler.replaceProducerTrack(producer, track);
	}

	_execAddConsumer(consumer)
	{
		logger.debug('_execAddConsumer()');

		if (consumer.closed)
			return Promise.reject(new Error('Consumer closed'));
		else if (consumer.handled)
			return Promise.reject(new Error('Consumer already handled by a Transport'));

		// Check whether we can receive this Consumer.
		if (!consumer.supported)
		{
			return Promise.reject(
				new Error('cannot receive this Consumer, unsupported codecs'));
		}

		let consumerTrack;

		consumer.setHandled('tmp');

		// Call the handler.
		return Promise.resolve()
			.then(() =>
			{
				return this._handler.addConsumer(consumer);
			})
			.then((track) =>
			{
				consumerTrack = track;

				const data =
				{
					id     : consumer.id,
					paused : consumer.locallyPaused
				};

				return this.safeEmitAsPromise('@request', 'enableConsumer', data);
			})
			.then(() =>
			{
				consumer.setHandled(true, consumerTrack);
				this._consumers.set(consumer.id, consumer);
				this._handleConsumer(consumer);

				return consumerTrack;
			})
			.catch((error) =>
			{
				consumer.setHandled(false);

				throw error;
			});
	}

	_execRemoveConsumer(consumer)
	{
		logger.debug('_execRemoveConsumer()');

		// Call the handler.
		return this._handler.removeConsumer(consumer);
	}

	_handleProducer(producer)
	{
		producer.on('@close', (originator, appData) =>
		{
			this._producers.delete(producer.id);

			// Enqueue command.
			this._commandQueue.push('removeProducer', { producer })
				.catch(() => {});

			if (originator === 'local')
			{
				this.safeEmit(
					'@notify', 'closeProducer', { id: producer.id, appData });
			}
		});

		producer.on('@pause', (appData) =>
		{
			const data =
			{
				id      : producer.id,
				appData : appData
			};

			this.safeEmit('@notify', 'pauseProducer', data);
		});

		producer.on('@resume', (appData) =>
		{
			const data =
			{
				id      : producer.id,
				appData : appData
			};

			this.safeEmit('@notify', 'resumeProducer', data);
		});

		producer.on('@replacetrack', (track, callback, errback) =>
		{
			// Enqueue command.
			return this._commandQueue.push('replaceProducerTrack', { producer, track })
				.then(callback)
				.catch(errback);
		});
	}

	_handleConsumer(consumer)
	{
		consumer.on('@close', () =>
		{
			this._consumers.delete(consumer.id);

			// Enqueue command.
			this._commandQueue.push('removeConsumer', { consumer })
				.catch(() => {});
		});

		consumer.on('@pause', (appData) =>
		{
			const data =
			{
				id      : consumer.id,
				appData : appData
			};

			this.safeEmit('@notify', 'pauseConsumer', data);
		});

		consumer.on('@resume', (appData) =>
		{
			const data =
			{
				id      : consumer.id,
				appData : appData
			};

			this.safeEmit('@notify', 'resumeConsumer', data);
		});
	}
}
