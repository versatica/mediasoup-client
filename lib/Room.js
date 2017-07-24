'use strict';

import { EventEmitter } from 'events';
import Logger from './Logger';
import * as utils from './utils';
import Device from './Device';
import CommandQueue from './CommandQueue';
import Sender from './Sender';
import { InvalidStateError } from './errors';

const logger = new Logger('Room');
const COMMAND_TIMEOUT = 3000; // 10 seconds.

/**
 * An instance of Room represents a multi conference.
 */
export default class Room extends EventEmitter
{
	constructor(peerName)
	{
		logger.debug('constructor() [peerName:"%s"]', peerName);

		if (!peerName || typeof peerName !== 'string')
			throw new TypeError('peerName must be a String');

		super();
		this.setMaxListeners(Infinity);

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Local peer name.
		// @type {String}
		this._peerName = peerName;

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
	}

	/**
	 * Whether the room is closed.
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * The list of senders.
	 * @return {Array<Sender>}
	 */
	get senders()
	{
		return Array.from(this._senders.values());
	}

	close()
	{
		if (this._closed)
			return;

		logger.debug('close()');

		// Set flag.
		this._closed = true;

		// Close the command queue.
		this._commandQueue.close();

		// Close the handler.
		this._handler.close();

		// Close all the senders.
		for (let sender of this._senders.values())
		{
			sender.close();
		}
		this._senders.clear();

		// Emit event.
		this.emit('close');
	}

	/**
	 * TODO
	 */
	join()
	{
		logger.debug('join()');

		// Enqueue command.
		return this._commandQueue.push(
			{
				name : 'join'
			});
	}

	/**
	 * Send the given audio/vidoe track.
	 * The track will be internally cloned so the application is responsible of
	 * stopping the original track when desired.
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
		return this._commandQueue.push(
			{
				name : 'addLocalTrack',
				data : { track }
			});
	}

	/**
	 * Provide the Room with a remote command received from mediasoup.
	 * @param {Object} command
	 * @param {String} command.name - Command name.
	 * @param {Object} [command.data] - Command data.
	 */
	receiveCommand(command)
	{
		logger.debug('receiveCommand() [name:%s]', command.name);

		// Enqueue command.
		this._commandQueue.push(command)
			.catch(() => {});
	}

	_emitCommand(command, callback, errback)
	{
		logger.debug('_emitCommand() [name:%s, data:%o]', command.name, command.data);

		if (typeof callback !== 'function')
			callback = function() {};

		if (typeof errback !== 'function')
			errback = function() {};

		try
		{
			this.emit('sendcommand', command, callback, errback);
		}
		catch (error)
		{
			setTimeout(() =>
			{
				logger.error('error during "sendcommand" event:');
				throw error;
			});
		}
	}

	_execCommand(command, promiseHolder)
	{
		logger.debug('_execCommand() [name:%s]', command.name);

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
				promise = Promise.reject(new Error(`unknown command "${command.name}"`));
			}
		}

		// Fill the given Promise holder.
		promiseHolder.promise = promise;
	}

	_execJoin()
	{
		if (this._joining)
			return Promise.reject(new InvalidStateError('already joining'));
		else if (this._joined)
			return Promise.reject(new InvalidStateError('already joined'));

		this._joining = true;

		const promise = new Promise((resolve, reject) =>
		{
			this._handler.getLocalParameters()
				.then((localParameters) =>
				{
					const command =
					{
						name : 'join',
						data :
						{
							peerName                : this._peerName,
							rtpCapabilities         : localParameters.rtpCapabilities,
							sendTransportParameters : localParameters.sendTransportParameters,
							recvTransportParameters : localParameters.recvTransportParameters
						}
					};

					const callback = (data) =>
					{
						if (this._closed)
						{
							reject(new InvalidStateError('Room closed'));
							return;
						}

						data = data || {};

						const { remoteParameters } = data;

						this._handler.setRemoteParameters(remoteParameters)
							.then(() =>
							{
								this._joining = false;
								this._joined = true;

								resolve();
							})
							.catch((error) =>
							{
								this._joining = false;

								reject(error);
							});
					};

					const errback = (message) =>
					{
						if (this._closed)
						{
							reject(new InvalidStateError('Room closed'));
							return;
						}

						this._joining = false;

						reject(new Error(message));
					};

					this._emitCommand(command, callback, errback);
				});
		});

		return utils.createPromiseWithTimeout(promise, COMMAND_TIMEOUT);
	}

	_execAddLocalTrack(track)
	{
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
			.then(() =>
			{
				// If closed, ensure the track is stopped.
				if (this._closed)
				{
					try { track.stop(); } catch (error) {}
					return;
				}

				// Create a new sender.
				const sender = new Sender(track, originalTrackId);

				// Handle the new sender.
				this._handleSender(sender);

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
		const track = sender.track;

		// Remove the sender from the map.
		this._senders.delete(sender.id);

		// Call the handler.
		return this._handler.removeLocalTrack(track);
	}

	_handleSender(sender)
	{
		// Store it in the map.
		this._senders.set(sender.id, sender);

		sender.on('close', () =>
		{
			if (this._closed)
				return;

			// Enqueue command.
			this._commandQueue.push(
				{
					name : 'removeLocalTrack',
					data : { sender }
				})
				.catch(() => {});
		});
	}
}
