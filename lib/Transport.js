import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import CommandQueue from './CommandQueue';
import Producer from './Producer';

const logger = new Logger('Transport');

export default class Transport extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {parameters: Object, callback: Function, errback: Function} update
	 * @emits {state: String} connectionstatechange
	 */
	constructor(
		{
			id,
			remoteParameters,
			direction,
			turnServers,
			iceTransportPolicy,
			Handler,
			extendedRtpCapabilities,
			canSendByKind
		}
	)
	{
		super(logger);

		logger.debug(
			'constructor() [id:%s, remoteParameters:%o, direction:%s]',
			id, remoteParameters, direction);

		// Id.
		// @type {String}
		this._id = id;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Direction.
		// @type {String}
		this._direction = direction;

		// Whether we can send audio/video based on computed extended RTP
		// capabilities.
		// @type {Object}
		this._canSendByKind = canSendByKind;

		// RTC handler instance.
		this._handler = new Handler(
			{
				remoteParameters,
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
		this._commandQueue = new CommandQueue((command, promiseHolder) => (
			this._execCommand(command, promiseHolder)
		));

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

	send(track, { simulcast })
	{
		logger.debug('send()');

		if (this._closed)
			return Promise.reject(new InvalidStateError('transport closed'));
		else if (!track)
			return Promise.reject(new TypeError('no track given'));
		else if (this._direction !== 'send')
			return Promise.reject(new UnsupportedError('not a sending transport'));
		else if (!this._canSendByKind[track.kind])
			return Promise.reject(new UnsupportedError(`cannot send ${track.kind}`));

		const producer = new Producer(track, { simulcast });

		// Enqueue command.
		return this._commandQueue.push('addProducer', { producer });
	}

	/**
	 * Restart ICE connection.
	 *
	 * @param {RTCIceParameters} remoteIceParameters
	 *
	 * @return {Promise}
	 */
	restartIce(remoteIceParameters)
	{
		logger.debug('restartIce()');

		if (this._closed || this._connectionState === 'new')
			return Promise.resolve();

		// Enqueue command.
		return this._commandQueue.push('restartIce', { remoteIceParameters });
	}

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
				{
					if (transportLocalParameters.dtlsParameters)
						data.dtlsParameters = transportLocalParameters.dtlsParameters;
					else if (transportLocalParameters.plainRtpParameters)
						data.plainRtpParameters = transportLocalParameters.plainRtpParameters;
				}

				this.safeEmit('@request', 'createTransport', data, callback, errback);
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
	 * @private
	 */
	enableProducerStats(producer, interval)
	{
		logger.debug('enableProducerStats() [producer:%o]', producer);

		const data =
		{
			id       : producer.id,
			interval : interval
		};

		this.safeEmit('@notify', 'enableProducerStats', data);
	}

	/**
	 * @private
	 */
	disableProducerStats(producer)
	{
		logger.debug('disableProducerStats() [producer:%o]', producer);

		const data =
		{
			id : producer.id
		};

		this.safeEmit('@notify', 'disableProducerStats', data);
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
		else if (this._direction !== 'recv')
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

	/**
	 * @private
	 */
	enableConsumerStats(consumer, interval)
	{
		logger.debug('enableConsumerStats() [consumer:%o]', consumer);

		const data =
		{
			id       : consumer.id,
			interval : interval
		};

		this.safeEmit('@notify', 'enableConsumerStats', data);
	}

	/**
	 * @private
	 */
	disableConsumerStats(consumer)
	{
		logger.debug('disableConsumerStats() [consumer:%o]', consumer);

		const data =
		{
			id : consumer.id
		};

		this.safeEmit('@notify', 'disableConsumerStats', data);
	}

	/**
	 * Receive remote stats.
	 *
	 * @private
	 *
	 * @param {Object} stats
	 */
	remoteStats(stats)
	{
		this.safeEmit('stats', stats);
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

				// Store it.
				this._producers.set(producer.id, producer);

				producer.on('@close', () => this._producers.delete(producer.id));
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
