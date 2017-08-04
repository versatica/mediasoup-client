'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as utils from './utils';
import Device from './Device';
import CommandQueue from './CommandQueue';

const logger = new Logger('Transport');

export default class Transport extends EnhancedEventEmitter
{
	constructor(direction, extendedRtpCapabilities, settings, appData)
	{
		logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		super();

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

		// Transport state. Values can be:
		// 'new'/'connecting'/'connected'/'failed'/'disconnected'/'closed'
		// @type {String}
		this._state = 'new';

		// Commands handler.
		// @type {CommandQueue}
		this._commandQueue = new CommandQueue();

		this._commandQueue.on('exec', this._execCommand.bind(this));

		// Device specific handler.
		this._handler = new Device.Handler(direction, extendedRtpCapabilities, settings);

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
	 * Transport state.
	 *
	 * @return {String}
	 */
	get state()
	{
		return this._state;
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
	 * Close the Transport.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		// Set flag.
		this._closed = true;

		// Close the CommandQueue.
		this._commandQueue.close();

		// Close the handler.
		this._handler.close();

		this.safeEmit(
			'notification', 'closeTransport', { id: this._id, appData });

		// Emit event.
		this.safeEmit('close');
	}

	/**
	 * Send the given Sender over this Transport.
	 *
	 * @param {Sender} sender
	 *
	 * @example
	 * transport.send(videoSender)
	 *   .then(() => {
	 *     // Done
	 *   });
	 */
	send(sender)
	{
		logger.debug('send() [sender:%o]', sender);

		if (this._direction !== 'send')
			return Promise.reject(new Error('cannot send on a receiving Transport'));
		else if (!sender || sender.klass !== 'Sender')
			return Promise.reject(new TypeError('wrong Sender'));

		// Enqueue command.
		return this._commandQueue.push('addSender', { sender });
	}

	/**
	 * Receive the given Receiver over this Transport.
	 *
	 * @param {Receiver} receiver
	 *
	 * @example
	 * transport.receive(aliceVideoReceiver)
	 *   .then(() => {
	 *     // Done
	 *   });
	 */
	receive(receiver)
	{
		logger.debug('receive() [receiver:%o]', receiver);

		if (this._direction !== 'recv')
			return Promise.reject(new Error('cannot receive on a sending Transport'));
		else if (!receiver || receiver.klass !== 'Receiver')
			return Promise.reject(new TypeError('wrong Receiver'));

		// Enqueue command.
		return this._commandQueue.push('addReceiver', { receiver });
	}

	_execCommand(command, promiseHolder)
	{
		logger.debug('_execCommand() [method:%s]', command.method);

		let promise;

		try
		{
			switch (command.method)
			{
				case 'addSender':
				{
					const { sender } = command;

					promise = this._execAddSender(sender);
					break;
				}

				case 'removeSender':
				{
					const { sender } = command;

					promise = this._execRemoveSender(sender);
					break;
				}

				case 'addReceiver':
				{
					const { receiver } = command;

					promise = this._execAddReceiver(receiver);
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

	_execAddSender(sender)
	{
		logger.debug('_execAddSender()');

		const { track } = sender;

		if (sender.closed)
			return Promise.reject(new Error('Sender closed'));
		else if (sender.hasTransport())
			return Promise.reject(new Error('Sender already has a Transport'));
		else if (track.readyState === 'ended')
			return Promise.reject(new Error('track.readyState is "ended"'));

		sender.setTransport(true);

		// Call the handler.
		return this._handler.addLocalTrack(track)
			.then((rtpParameters) =>
			{
				return new Promise((resolve, reject) =>
				{
					this.safeEmit('request',
						// Request method.
						'createReceiver',
						// Request data.
						{
							id            : sender.id,
							transportId   : this._id,
							rtpParameters : rtpParameters,
							paused        : sender.paused,
							appData       : sender.appData
						},
						// Callback.
						resolve,
						// Errback.
						reject);
				});
			})
			.catch((error) =>
			{
				sender.setTransport(null);

				this._commandQueue.push('removeSender', { sender })
					.catch(() => {});

				throw error;
			})
			.then(() =>
			{
				this._handleSender(sender);
			});
	}

	_execRemoveSender(sender)
	{
		logger.debug('_execRemoveSender()');

		const { track } = sender;

		// Call the handler.
		return this._handler.removeLocalTrack(track);
	}

	_execAddReceiver(receiver)
	{
		logger.debug('_execAddReceiver()');

		if (receiver.closed)
			return Promise.reject(new Error('Receiver closed'));
		else if (receiver.hasTransport())
			return Promise.reject(new Error('Receiver already has a Transport'));

		receiver.setTransport(true);

		return Promise.resolve();

		// Call the handler.
		// return this._handler.addLocalTrack(track)
		// 	.then((rtpParameters) =>
		// 	{
		// 		return new Promise((resolve, reject) =>
		// 		{
		// 			this.safeEmit('request',
		// 				// Request method.
		// 				'createReceiver',
		// 				// Request data.
		// 				{
		// 					id            : sender.id,
		// 					transportId   : this._id,
		// 					rtpParameters : rtpParameters,
		// 					paused        : sender.paused,
		// 					appData       : sender.appData
		// 				},
		// 				// Callback.
		// 				resolve,
		// 				// Errback.
		// 				reject);
		// 		});
		// 	})
		// 	.catch((error) =>
		// 	{
		// 		sender.setTransport(null);

		// 		this._commandQueue.push('removeSender', { sender })
		// 			.catch(() => {});

		// 		throw error;
		// 	})
		// 	.then(() =>
		// 	{
		// 		this._handleSender(sender);
		// 	});
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('connectionstatechange', (state) =>
		{
			if (this._state === state)
				return;

			this._state = state;

			if (!this._closed)
				this.safeEmit('statechange', state);
		});

		handler.on(
			'needtransportremoteparameters', (transportLocalParameters, callback, errback) =>
			{
				this.safeEmit('request',
					// Request method.
					'createTransport',
					// Request data.
					{
						id             : this._id,
						options        : this._settings.transportOptions,
						dtlsParameters : transportLocalParameters.dtlsParameters,
						appData        : this._appData
					},
					// Callback.
					callback,
					// Errback.
					errback);
			});
	}

	_handleSender(sender)
	{
		sender.on('close', (appData) =>
		{
			this.safeEmit(
				'notification', 'closeReceiver', { id: sender.id, appData });

			// Enqueue command.
			this._commandQueue.push('removeSender', { sender })
				.catch(() => {});
		});

		sender.on('pause', (appData) =>
		{
			this.safeEmit(
				'notification', 'pauseReceiver', { id: sender.id, appData });
		});

		sender.on('resume', (appData) =>
		{
			this.safeEmit(
				'notification', 'resumeReceiver', { id: sender.id, appData });
		});
	}
}
