'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import * as utils from './utils';
import { InvalidStateError, TimeoutError } from './errors';
import * as ortc from './ortc';
import Device from './Device';
import CommandQueue from './CommandQueue';

const logger = new Logger('Transport');

export default class Transport extends SafeEventEmitter
{
	constructor(direction, extendedRtpCapabilities)
	{
		logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		super();

		// Transport direction ('send' / 'only').
		// @type {String}
		this._direction = direction;

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = extendedRtpCapabilities;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Id.
		// @type {Number}
		this._id = utils.randomNumber();

		// Commands handler.
		// @type {CommandQueue}
		this._commandQueue = new CommandQueue();

		// Device specific handler.
		this._handler = new Device.Handler();

		// Handle the commands queue.
		this._commandQueue.on('exec', this._execCommand.bind(this));
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
	 * Transport id.
	 *
	 * @return {Number}
	 */
	get id()
	{
		return this._id;
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

		// Close all the Senders.
		for (let sender of this._senders.values())
		{
			sender.close();
		}
		this._senders.clear();

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

		if (!sender || !sender.track)
			return Promise.reject(new TypeError('wrong Sender'));
		else if (sender.closed)
			return Promise.reject(new Error('Sender closed'));

		const { track } = sender;

		// Call the handler.
		return this._handler.addLocalTrack(track)
			.then((encodings) =>
			{
				// TODO: Room sholuld have a fixed this._rtpSendRtpParameters
				// to get the codecs, etc (different for audio and video).
				// const rtpParameters =
				// {
				// 	muxId            : null, // TODO: provided by handler.addLocalTrack?
				// 	codecs           : [],
				// 	headerExtensions : [],
				// 	encodings        : encodings,
				// 	rtcp             : {}
				// };

				// TODO: Return promise so this depends on proper server response?
				// Request the server to create a Receiver for this Sender.
				// this._sendRequest('createReceiver', { rtpParameters })
				// 	.catch((error) =>
				// 	{
				// 		sender.close(error);
				// 	});
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

		// TODO: Send Request

		// Call the handler.
		return this._handler.removeLocalTrack(track);
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('needtransport', (localDtlsParameters, callback, errback) =>
		{
			// this._sendRequest(
			// 	'createTransport', { dtlsParameters: localDtlsParameters })
			// 	.then((response) =>
			// 	{
			// 		callback(response);
			// 	})
			// 	.catch((error) =>
			// 	{
			// 		errback(error);
			// 	});
		});
	}

	_handleSender(sender)
	{
		sender.on('close', () =>
		{
			// Enqueue command.
			this._commandQueue.push('removeSender', { sender })
				.catch(() => {});
		});
	}
}
