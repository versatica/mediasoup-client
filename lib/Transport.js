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
			'notify', 'closeTransport', { id: this._id, appData });

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

				case 'removeReceiver':
				{
					const { receiver } = command;

					promise = this._execRemoveReceiver(receiver);
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

		if (sender.closed)
			return Promise.reject(new Error('Sender closed'));
		else if (sender.hasTransport())
			return Promise.reject(new Error('Sender already has a Transport'));

		sender.setTransport(true);

		// Call the handler.
		return Promise.resolve()
			.then(() =>
			{
				return this._handler.addSender(sender);
			})
			.then((rtpParameters) =>
			{
				const data =
				{
					id            : sender.id,
					kind          : sender.kind,
					transportId   : this._id,
					rtpParameters : rtpParameters,
					paused        : sender.paused,
					appData       : sender.appData
				};

				return this.safeEmitAsPromise('request', 'createReceiver', data);
			})
			.then(() =>
			{
				this._handleSender(sender);
			})
			.catch((error) =>
			{
				sender.setTransport(null);

				this._commandQueue.push('removeSender', { sender })
					.catch(() => {});

				throw error;
			});
	}

	_execRemoveSender(sender)
	{
		logger.debug('_execRemoveSender()');

		// Call the handler.
		return this._handler.removeSender(sender);
	}

	_execAddReceiver(receiver)
	{
		logger.debug('_execAddReceiver()');

		if (receiver.closed)
			return Promise.reject(new Error('Receiver closed'));
		else if (receiver.hasTransport())
			return Promise.reject(new Error('Receiver already has a Transport'));

		// Check whether we can receive this Receiver.
		if (!receiver.supported)
			return Promise.reject(new Error('cannot receive this Receiver'));

		receiver.setTransport(true);

		// Call the handler.
		return Promise.resolve()
			.then(() =>
			{
				return this._handler.addReceiver(receiver);
			})
			.then((track) =>
			{
				receiver.setTrack(track);
				this._handleReceiver(receiver);

				// TODO: Send a special request to enable the remote Sender sending
				// media to us.
			})
			.then(() =>
			{
				return receiver.track;
			})
			.catch((error) =>
			{
				receiver.setTransport(null);

				// NOTE: If something goes wrong above (it shouldn't) this may also fail,
				// but let's try it anyway.
				this._commandQueue.push('removeReceiver', { receiver })
					.catch(() => {});

				throw error;
			});
	}

	_execRemoveReceiver(receiver)
	{
		logger.debug('_execRemoveReceiver()');

		// Call the handler.
		return this._handler.removeReceiver(receiver);
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
			'needcreatetransport',
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

				this.safeEmit('request', 'createTransport', data, callback, errback);
			});

		handler.on('needupdatetransport', (transportLocalParameters) =>
		{
			const data =
			{
				id             : this._id,
				dtlsParameters : transportLocalParameters.dtlsParameters
			};

			this.safeEmit('notify', 'updateTransport', data);
		});
	}

	_handleSender(sender)
	{
		sender.on('close', (appData) =>
		{
			this.safeEmit(
				'notify', 'closeReceiver', { id: sender.id, appData });

			// Enqueue command.
			this._commandQueue.push('removeSender', { sender })
				.catch(() => {});
		});

		sender.on('pause', (appData, resolve, reject) =>
		{
			const data =
			{
				id      : sender.id,
				appData : appData
			};

			this.safeEmit('request', 'pauseReceiver', data, resolve, reject);
		});

		sender.on('resume', (appData, resolve, reject) =>
		{
			const data =
			{
				id      : sender.id,
				appData : appData
			};

			this.safeEmit('request', 'resumeReceiver', data, resolve, reject);
		});
	}

	_handleReceiver(receiver)
	{
		receiver.on('close', () =>
		{
			// Enqueue command.
			this._commandQueue.push('removeReceiver', { receiver })
				.catch(() => {});
		});

		receiver.on('play', (resolve, reject) =>
		{
			const data =
			{
				id : receiver.id
			};

			this.safeEmit('request', 'playSender', data, resolve, reject);
		});

		receiver.on('stop', (resolve, reject) =>
		{
			const data =
			{
				id : receiver.id
			};

			this.safeEmit('request', 'stopSender', data, resolve, reject);
		});
	}
}
