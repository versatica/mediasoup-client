import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError } from './errors';
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
	 * @emits @close
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

		this.emit('@close');
		this.safeEmit('close', 'local', appData);

		this._destroy();
	}

	/**
	 * My remote Transport was closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close');
		this.safeEmit('close', 'remote', appData);

		this._destroy();
	}

	_destroy()
	{
		// Close the CommandQueue.
		this._commandQueue.close();

		// Close the handler.
		this._handler.close();
	}

	restartIce()
	{
		logger.debug('restartIce()');

		if (this._closed)
			return;
		else if (this._connectionState === 'new')
			return;

		Promise.resolve()
			.then(() =>
			{
				const data =
				{
					id : this._id
				};

				return this.safeEmitAsPromise('@request', 'restartTransport', data);
			})
			.then((response) =>
			{
				const remoteIceParameters = response.iceParameters;

				// Enqueue command.
				return this._commandQueue.push('restartIce', { remoteIceParameters });
			})
			.catch((error) =>
			{
				logger.error('restartIce() | failed: %o', error);
			});
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
					id        : this._id,
					direction : this._direction,
					options   : this._settings.transportOptions,
					appData   : this._appData
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
				rtpParameters : rtpParameters
			};

			// Update Producer RTP parameters.
			producer.setRtpParameters(rtpParameters);

			// Notify the server.
			this.safeEmit('@notify', 'updateProducer', data);
		});
	}

	/**
	 * Send the given Producer over this Transport.
	 *
	 * @private
	 *
	 * @param {Producer} producer
	 *
	 * @return {Promise}
	 */
	addProducer(producer)
	{
		logger.debug('addProducer() [producer:%o]', producer);

		if (this._closed)
			return Promise.reject(new InvalidStateError('Transport closed'));
		if (this._direction !== 'send')
			return Promise.reject(new Error('not a sending Transport'));

		// Enqueue command.
		return this._commandQueue.push('addProducer', { producer });
	}

	/**
	 * @private
	 */
	removeProducer(producer, originator, appData)
	{
		logger.debug('removeProducer() [producer:%o]', producer);

		// Enqueue command.
		if (!this._closed)
		{
			this._commandQueue.push('removeProducer', { producer })
				.catch(() => {});
		}

		if (originator === 'local')
			this.safeEmit('@notify', 'closeProducer', { id: producer.id, appData });
	}

	/**
	 * @private
	 */
	pauseProducer(producer, appData)
	{
		logger.debug('pauseProducer() [producer:%o]', producer);

		const data =
		{
			id      : producer.id,
			appData : appData
		};

		this.safeEmit('@notify', 'pauseProducer', data);
	}

	/**
	 * @private
	 */
	resumeProducer(producer, appData)
	{
		logger.debug('resumeProducer() [producer:%o]', producer);

		const data =
		{
			id      : producer.id,
			appData : appData
		};

		this.safeEmit('@notify', 'resumeProducer', data);
	}

	/**
	 * @private
	 *
	 * @return {Promise}
	 */
	replaceProducerTrack(producer, track)
	{
		logger.debug('replaceProducerTrack() [producer:%o]', producer);

		return this._commandQueue.push(
			'replaceProducerTrack', { producer, track });
	}

	/**
	 * Receive the given Consumer over this Transport.
	 *
	 * @private
	 *
	 * @param {Consumer} consumer
	 *
	 * @return {Promise} Resolves to a remote MediaStreamTrack.
	 */
	addConsumer(consumer)
	{
		logger.debug('addConsumer() [consumer:%o]', consumer);

		if (this._closed)
			return Promise.reject(new InvalidStateError('Transport closed'));
		if (this._direction !== 'recv')
			return Promise.reject(new Error('not a receiving Transport'));

		// Enqueue command.
		return this._commandQueue.push('addConsumer', { consumer });
	}

	/**
	 * @private
	 */
	removeConsumer(consumer)
	{
		logger.debug('removeConsumer() [consumer:%o]', consumer);

		// Enqueue command.
		this._commandQueue.push('removeConsumer', { consumer })
			.catch(() => {});
	}

	/**
	 * @private
	 */
	pauseConsumer(consumer, appData)
	{
		logger.debug('pauseConsumer() [consumer:%o]', consumer);

		const data =
		{
			id      : consumer.id,
			appData : appData
		};

		this.safeEmit('@notify', 'pauseConsumer', data);
	}

	/**
	 * @private
	 */
	resumeConsumer(consumer, appData)
	{
		logger.debug('resumeConsumer() [consumer:%o]', consumer);

		const data =
		{
			id      : consumer.id,
			appData : appData
		};

		this.safeEmit('@notify', 'resumeConsumer', data);
	}

	/**
	 * @private
	 */
	setConsumerPreferredProfile(consumer, profile)
	{
		logger.debug('setConsumerPreferredProfile() [consumer:%o]', consumer);

		const data =
		{
			id      : consumer.id,
			profile : profile
		};

		this.safeEmit('@notify', 'setConsumerPreferredProfile', data);
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

				case 'restartIce':
				{
					const { remoteIceParameters } = command;

					promise = this._execRestartIce(remoteIceParameters);
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

		let producerRtpParameters;

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
				producer.setRtpParameters(producerRtpParameters);
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

		let consumerTrack;

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
					id               : consumer.id,
					transportId      : this.id,
					paused           : consumer.locallyPaused,
					preferredProfile : consumer.preferredProfile
				};

				return this.safeEmitAsPromise('@request', 'enableConsumer', data);
			})
			.then((response) =>
			{
				const { paused, preferredProfile, effectiveProfile } = response;

				if (paused)
					consumer.remotePause();

				if (preferredProfile)
					consumer.remoteSetPreferredProfile(preferredProfile);

				if (effectiveProfile)
					consumer.remoteEffectiveProfileChanged(effectiveProfile);

				return consumerTrack;
			});
	}

	_execRemoveConsumer(consumer)
	{
		logger.debug('_execRemoveConsumer()');

		// Call the handler.
		return this._handler.removeConsumer(consumer);
	}

	_execRestartIce(remoteIceParameters)
	{
		logger.debug('_execRestartIce()');

		// Call the handler.
		return this._handler.restartIce(remoteIceParameters);
	}
}
