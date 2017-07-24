'use strict';

import { EventEmitter } from 'events';
import Logger from './Logger';
import { InvalidStateError } from './errors';

const logger = new Logger('CommandQueue');

/**
 * @ignore
 */
export default class CommandQueue extends EventEmitter
{
	constructor()
	{
		super();
		this.setMaxListeners(Infinity);

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Busy running a command.
		this._busy = false;

		// Queue for pending commands. Each command is an Object with name, data,
		// resolve and reject members.
		// @type {Array<Object>}
		this._queue = [];
	}

	close()
	{
		this._closed = true;
	}

	push(command)
	{
		logger.debug('_push() [name:%s]', command.name);

		return new Promise((resolve, reject) =>
		{
			const queue = this._queue;

			command.resolve = resolve;
			command.reject = reject;

			// Append command to the queue.
			queue.push(command);
			this._handlePendingCommands();
		});
	}

	_handlePendingCommands()
	{
		if (this._busy)
			return;

		const queue = this._queue;

		// Take the first command.
		const command = queue[0];

		if (!command)
			return;

		this._busy = true;

		// Execute it.
		this._handleCommand(command)
			.then(() =>
			{
				this._busy = false;

				// Remove the first command (the completed one) from the queue.
				queue.shift();

				// And continue.
				this._handlePendingCommands();
			});
	}

	_handleCommand(command)
	{
		logger.debug('_handleCommand() [name:%s]', command.name);

		if (this._closed)
		{
			command.reject(new InvalidStateError('Room closed'));
			return Promise.resolve();
		}

		const promiseHolder = { promise: null };

		this.emit('exec', command, promiseHolder);

		return promiseHolder.promise
			.then((result) =>
			{
				logger.debug('%s command succeeded', command.name);

				if (this._closed)
				{
					command.reject(new InvalidStateError('Room closed'));
					return;
				}

				// Resolve the command with the given result (if any).
				try
				{
					command.resolve(result);
				}
				catch (error)
				{
					logger.error('error resolving %s command: %o', command.name, error);
				}
			})
			.catch((error) =>
			{
				logger.error('%s command failed: %o', command.name, error);

				// Reject the command with the error.
				try
				{
					command.reject(error);
				}
				catch (error2)
				{
					logger.error('error rejecting %s command: %o', command.name, error2);
				}
			});
	}
}
