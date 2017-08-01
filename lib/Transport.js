'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import * as utils from './utils';
import Device from './Device';
import CommandQueue from './CommandQueue';

const logger = new Logger('Transport');

export default class Transport extends SafeEventEmitter
{
	constructor(direction, extendedRtpCapabilities, settings)
	{
		logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		super();

		// Room settings.
		// @type {Object}
		this._settings = settings;

		// Id.
		// @type {Number}
		this._id = utils.randomNumber();

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

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
	 * Close the Transport.
	 */
	close()
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

		this.safeEmit('notification', 'closeTransport', { transportId: this._id });

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
	 *   .then((sender) => {
	 *     // Done
	 *   });
	 */
	send(sender)
	{
		logger.debug('send() [sender:%o]', sender);

		if (!sender || sender.klass !== 'Sender')
			return Promise.reject(new TypeError('wrong Sender'));

		// Enqueue command.
		return this._commandQueue.push('addSender', { sender });
	}

	_execCommand(command, promiseHolder)
	{
		logger.debug('_execCommand() [method:%s]', command.method);

		let promise;

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

			default:
			{
				promise = Promise.reject(
					new Error(`unknown command method "${command.method}"`));
			}
		}

		// Fill the given Promise holder.
		promiseHolder.promise = promise;
	}

	_execAddSender(sender)
	{
		logger.debug('_execAddSender()');

		const { track } = sender;

		if (sender.hasTransport())
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
							receiverId    : sender.id,
							transportId   : this._id,
							rtpParameters : rtpParameters,
							paused        : sender.paused
						},
						// Callback.
						resolve,
						// Errback.
						reject);
				});
			})
			.catch((error) =>
			{
				sender.setTransport(false);

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

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('needtransport', (localParameters, callback, errback) =>
		{
			this.safeEmit('request',
				// Request method.
				'createTransport',
				// Request data.
				{
					transportId    : this._id,
					options        : this._settings.transportOptions,
					dtlsParameters : localParameters.dtlsParameters
				},
				// Callback.
				callback,
				// Errback.
				errback);
		});
	}

	_handleSender(sender)
	{
		sender.on('close', () =>
		{
			this.safeEmit('notification', 'closeReceiver', { receiverId: sender.id });

			// Enqueue command.
			this._commandQueue.push('removeSender', { sender })
				.catch(() => {});
		});

		sender.on('pause', () =>
		{
			this.safeEmit('notification', 'pauseReceiver', { receiverId: sender.id });
		});

		sender.on('resume', () =>
		{
			this.safeEmit('notification', 'resumeReceiver', { receiverId: sender.id });
		});
	}
}
