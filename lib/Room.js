'use strict';

import { EventEmitter } from 'events';
import Logger from './Logger';
import Device from './Device';
import Sender from './Sender';
import { InvalidStateError } from './errors';

const logger = new Logger('Room');

/**
 * An instance of Room represents a multi conference.
 */
export default class Room extends EventEmitter
{
	constructor()
	{
		logger.debug('constructor()');

		super();
		this.setMaxListeners(Infinity);

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Queue for pending actions. Each action is an Object with type, data,
		// resolve and reject members.
		// @type {Array<Object>}
		this._queue = [];

		// Device specific handler.
		this._handler = new Device.Handler();

		// Map of Sender instances indexed by sender.id (matching track.id).
		// @type {map<String, Sender>}
		this._senders = new Map();
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

		// Emit event.
		this.emit('close');

		// Close all the senders.
		for (let sender of this._senders.values())
		{
			sender.close();
		}

		// Close the handler.
		this._handler.close();
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
		logger.debug('send() [kind:"%s", id:"%s"]', track.kind, track.id);

		// Enqueue the action and return a Promise.
		return this._enqueueAction(
			{
				type : 'send',
				data :
				{
					track : track
				}
			});
	}

	_enqueueAction(action)
	{
		return new Promise((resolve, reject) =>
		{
			const queue = this._queue;

			action.resolve = resolve;
			action.reject = reject;

			// Append action to the queue.
			queue.push(action);

			// If this is the only pending action, exec it now.
			if (queue.length === 1)
				this._execPendingActions();
		});
	}

	_execPendingActions()
	{
		const queue = this._queue;

		if (queue.length === 0)
			return;

		// Take the first action.
		const action = queue[0];

		// Execute it.
		this._execAction(action)
			.then(() =>
			{
				// Remove the first action (the completed one) from the queue.
				queue.shift();

				// And continue.
				this._execPendingActions();
			});
	}

	_execAction(action)
	{
		if (this._closed)
		{
			action.reject(new InvalidStateError('Room closed'));
			return Promise.resolve();
		}

		let promise;

		switch (action.type)
		{
			case 'send':
			{
				const { track } = action.data;

				promise = this._execActionSend(track);
				break;
			}

			default:
			{
				action.reject(new Error(`unknown action.type "${action.type}"`));
				return;
			}
		}

		return promise
			.then((result) =>
			{
				if (this._closed)
				{
					action.reject(new InvalidStateError('Room closed'));
					return;
				}

				// Resolve the action with the given result (if any).
				try
				{
					action.resolve(result);
				}
				catch (error)
				{
					logger.error('error resolving %s action: %o', action.type, error);
				}
			})
			.catch((error) =>
			{
				logger.error('%s action failed: %o', action.type, error);

				// Reject the action with the error.
				try
				{
					action.reject(error);
				}
				catch (error2)
				{
					logger.error('error rejecting %s action: %o', action.type, error2);
				}
			});
	}

	_execActionSend(track)
	{
		if (!(track instanceof MediaStreamTrack))
			return Promise.reject(new Error('track is not a MediaStreamTrack'));

		if (track.readyState === 'ended')
			return Promise.reject(new Error('track.readyState is "ended"'));

		const originalTrackId = track.id;

		// Clone the track.
		track = track.clone();

		return this._handler.addTrack(track)
			.then(() =>
			{
				// If closed, ensure the track is stopped.
				if (this._closed)
				{
					try { track.stop(); } catch (error) {}
					return;
				}

				// Don't allow duplicated tracks.
				for (let sender of this._senders.values())
				{
					if (sender.originalTrackId === originalTrackId)
						throw new Error('track already handled');
				}

				// Create a new Sender.
				const sender = new Sender(track, originalTrackId);

				// Store it in the map.
				this._senders.set(sender.id, sender);

				sender.on('close', () =>
				{
					if (this._closed)
						return;

					// Remove it from the map.
					this._senders.delete(sender.id);

					// Notify the handler.
					this._handler.removeTrack(track);
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
}
