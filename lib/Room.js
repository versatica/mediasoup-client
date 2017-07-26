'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import * as utils from './utils';
import { InvalidStateError } from './errors';
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
		return this._commandQueue.push(
			{
				name : 'join'
			});
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
		return this._commandQueue.push(
			{
				name : 'addLocalTrack',
				data : { track }
			});
	}

	/**
	 * Provide the Room with a remote command received from mediasoup.
	 *
	 * @param {Object} command
	 */
	receiveCommand(command)
	{
		logger.debug('receiveCommand() [command.name:%s]', command.name);

		// Enqueue command.
		this._commandQueue.push(command)
			.catch((error) =>
			{
				logger.error('receiveCommand() failed [command.name:%s]: %o',
					command.name, error);
			});
	}

	_emitCommand(command, callback, errback)
	{
		logger.debug('_emitCommand() [command.name:%s, command.data:%o]',
			command.name, command.data);

		if (typeof callback !== 'function')
			callback = function() {};

		if (typeof errback !== 'function')
			errback = function() {};

		this.safeEmit('sendcommand', command, callback, errback);
	}

	_execCommand(command, promiseHolder)
	{
		logger.debug('_execCommand() [command.name:%s]', command.name);

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
					new Error(`unknown command.name "${command.name}"`));
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
							rtpCapabilities    : localParameters.rtpCapabilities,
							sendDtlsParameters : localParameters.sendDtlsParameters,
							recvDtlsParameters : localParameters.recvDtlsParameters
						}
					};

					const callback = (remoteParameters) =>
					{
						if (promise.didTimeout)
						{
							this._joining = false;
							return;
						}

						if (this._closed)
						{
							reject(new InvalidStateError('Room closed'));
							return;
						}

						// Reduce/complete local parameters with remote parameters.
						const newLocalParameters =
						{
							rtpCapabilities    : ortc.reduceLocalRtpCapabilities(
								localParameters.rtpCapabilities, remoteParameters.rtpCapabilities),
							sendDtlsParameters : ortc.updateLocalDtlsParameters(
								localParameters.sendDtlsParameters, remoteParameters.recvDtlsParameters),
							recvDtlsParameters : ortc.updateLocalDtlsParameters(
								localParameters.recvDtlsParameters, remoteParameters.sendDtlsParameters)
						};

						logger.debug('_execJoin() | computed local parameters:%o', newLocalParameters);

						// Provide the handler with the new local parameters.
						this._handler.setLocalParameters(newLocalParameters);

						// Provide the handler with the remote parameters.
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
						if (promise.didTimeout)
						{
							this._joining = false;
							return;
						}

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

				// Create a new Sender.
				const sender = new Sender(track, originalTrackId);

				// Handle the new Sender.
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
