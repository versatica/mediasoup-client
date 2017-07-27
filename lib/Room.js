'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import { InvalidStateError, TimeoutError } from './errors';
import * as ortc from './ortc';
import Device from './Device';
import CommandQueue from './CommandQueue';
import Sender from './Sender';

const logger = new Logger('Room');
const COMMAND_TIMEOUT = 10000; // 10 seconds.

/**
 * An instance of Room represents a remote multi conference and a local
 * peer that joins it.
 */
export default class Room extends SafeEventEmitter
{
	constructor()
	{
		logger.debug('constructor()');

		super();

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Whether we are joining the remote room.
		// @type {Boolean}
		this._joining = false;

		// Whether we have already joined the remote room.
		// @type {Boolean}
		this._joined = false;

		// Commands handler.
		// @type {CommandQueue}
		this._commandQueue = new CommandQueue();

		// Device specific handler.
		this._handler = new Device.Handler();

		// Map of Sender instances indexed by sender.id (matching track.id).
		// @type {map<String, Sender>}
		this._senders = new Map();

		// Handle the commands queue.
		this._commandQueue.on('exec', this._execCommand.bind(this));

		// Handle the handler.
		this._handleHandler();
	}

	/**
	 * Whether the room is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * The list of senders.
	 *
	 * @return {Array<Sender>}
	 */
	get senders()
	{
		return Array.from(this._senders.values());
	}

	/**
	 * Close the Room.
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
	 * Start the procedures to join a remote room.
	 *
	 * @return {Promise}
	 */
	join()
	{
		logger.debug('join()');

		// Enqueue command.
		return this._commandQueue.push('join');
	}

	/**
	 * Send the given audio/video track.
	 * The track will be internally cloned so the application is responsible of
	 * stopping the original track when desired.
	 *
	 * @param {MediaStreamTrack} track - An active audio or video track.
	 * @return {Promise<Sender>} On success, it resolves with a new Sender
	 * instance.
	 *
	 * @example
	 * room.send(videoTrack)
	 *   .then((sender) => {
	 *     // Got a Sender
	 *   });
	 */
	send(track)
	{
		logger.debug('send() [track:%o]', track);

		// Enqueue command.
		return this._commandQueue.push('addLocalTrack', { track });
	}

	/**
	 * Provide the Room with a remote command received from mediasoup.
	 *
	 * @param {Object} command
	 */
	receiveCommand(command)
	{
		logger.debug(
			'receiveCommand() [command:%s, data:%o]', command.name, command.data);

		// Enqueue command.
		this._commandQueue.push(command.name, command.data)
			.catch((error) =>
			{
				logger.error(
					'receiveCommand() failed [command:%s]: %o', command.name, error);
			});
	}

	_sendCommand(name, data)
	{
		logger.debug('_sendCommand() [command:%s, data:%o]', name, data);

		return new Promise((resolve, reject) =>
		{
			let done = false;

			const timer = setTimeout(() =>
			{
				logger.error(
					'"sendcommand" event failed [command:%s]: timeout', name);

				done = true;
				reject(new TimeoutError('timeout'));
			}, COMMAND_TIMEOUT);

			// TODO: We could also handle room 'close' event here.

			const callback = (data) =>
			{
				if (done)
					return;

				done = true;

				if (this._closed)
				{
					logger.error(
						'"sendcommand" event failed [command:%s]: Room closed', name);

					reject(new Error('Room closed'));
					return;
				}

				logger.debug(
					'"sendcommand" event succeeded [command:%s, data:%o]', name, data);

				clearTimeout(timer);
				resolve(data);
			};

			const errback = (message) =>
			{
				if (done)
					return;

				done = true;

				if (this._closed)
				{
					logger.error(
						'"sendcommand" event failed [command:%s]: Room closed', name);

					reject(new Error('Room closed'));
					return;
				}

				logger.error(
					'"sendcommand" event failed [command:%s]: %s', name, message);

				clearTimeout(timer);
				reject(new Error(message));
			};

			const command = { name, data };

			this.safeEmit('sendcommand', command, callback, errback);
		});
	}

	_execCommand(command, promiseHolder)
	{
		logger.debug('_execCommand() [command:%s]', command.name);

		let promise;

		switch (command.name)
		{
			case 'join':
			{
				promise = this._execJoin();
				break;
			}

			case 'addLocalTrack':
			{
				const { track } = command.data;

				promise = this._execAddLocalTrack(track);
				break;
			}

			case 'removeLocalTrack':
			{
				const { sender } = command.data;

				promise = this._execRemoveLocalTrack(sender);
				break;
			}

			default:
			{
				promise = Promise.reject(
					new Error(`unknown command name "${command.name}"`));
			}
		}

		// Fill the given Promise holder.
		promiseHolder.promise = promise;
	}

	_execJoin()
	{
		logger.debug('_execJoin()');

		if (this._joining)
			return Promise.reject(new InvalidStateError('already joining'));
		else if (this._joined)
			return Promise.reject(new InvalidStateError('already joined'));

		let localRtpCapabilities;

		this._joining = true;

		return this._handler.getLocalRtpCapabilities()
			.then((rtpCapabilities) =>
			{
				localRtpCapabilities = rtpCapabilities;

				return this._sendCommand('join');
			})
			.then((data) =>
			{
				let remoteRtpCapabilities = data.rtpCapabilities;

				// Reduce remote RTP capabilities with local ones.
				remoteRtpCapabilities = ortc.reduceRemoteRtpCapabilities(
					remoteRtpCapabilities, localRtpCapabilities);

				// Provide the handler with the reduced remote RTP capabilities.
				this._handler.setRemoteRtpCapabilities(remoteRtpCapabilities);

				this._joining = false;
				this._joined = true;
			})
			.catch((error) =>
			{
				this._joining = false;

				throw error;
			});
	}

	_execAddLocalTrack(track)
	{
		logger.debug('_execAddLocalTrack()');

		if (!this._joined)
			return Promise.reject(new InvalidStateError('not joined'));
		else if (!(track instanceof MediaStreamTrack))
			return Promise.reject(new TypeError('track is not a MediaStreamTrack'));
		else if (track.readyState === 'ended')
			return Promise.reject(new Error('track.readyState is "ended"'));

		// Don't allow duplicated tracks.
		for (let sender of this._senders.values())
		{
			if (sender.originalTrackId === track.id)
				return Promise.reject(new Error('track already handled'));
		}

		const originalTrackId = track.id;

		// Clone the track.
		track = track.clone();

		// Call the handler.
		return this._handler.addLocalTrack(track)
			.then((rtpParameters) =>
			{
				// If closed, ensure the track is stopped.
				if (this._closed)
				{
					try { track.stop(); } catch (error) {}
					return;
				}

				// Create a new Sender.
				const sender = new Sender(track, originalTrackId);

				// Store it in the map.
				this._senders.set(sender.id, sender);

				// Handle the new Sender.
				this._handleSender(sender);

				// TODO: Return promise so this depends on proper server response?
				// Request the server to create a Receiver for this Sender.
				this._sendCommand('createReceiver', { rtpParameters })
					.catch((error) =>
					{
						sender.close(error);
					});

				// Resolve with the Sender.
				return sender;
			})
			.catch((error) =>
			{
				// Stop the track.
				try { track.stop(); } catch (error) {}

				throw error;
			});
	}

	_execRemoveLocalTrack(sender)
	{
		logger.debug('_execRemoveLocalTrack()');

		const track = sender.track;

		// Remove the sender from the map.
		this._senders.delete(sender.id);

		// Call the handler.
		return this._handler.removeLocalTrack(track);
	}

	_handleHandler()
	{
		const handler = this._handler;

		handler.on('needtransport', (localDtlsParameters, callback, errback) =>
		{
			this._sendCommand('createTransport', { localDtlsParameters })
				.then((data) =>
				{
					callback(data);
				})
				.catch((error) =>
				{
					errback(error);
				});
		});
	}

	_handleSender(sender)
	{
		sender.on('close', () =>
		{
			if (this._closed)
				return;

			// Enqueue command.
			this._commandQueue.push('removeLocalTrack', { sender })
				.catch(() => {});
		});
	}
}
