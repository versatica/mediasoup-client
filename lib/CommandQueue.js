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
		return new Promise((resolve, reject) =>
		{
			const queue = this._queue;

			command.resolve = resolve;
			command.reject = reject;

			// Append command to the queue.
			queue.push(command);
			this._execPendingCommands();
		});
	}

	_execPendingCommands()
	{
		const queue = this._queue;

		// If there is not just one pending command, return.
		if (queue.length !== 1)
			return;

		// Take the first command.
		const command = queue[0];

		// Execute it.
		this._execCommand(command)
			.then(() =>
			{
				// Remove the first command (the completed one) from the queue.
				queue.shift();

				// And continue.
				this._execPendingCommands();
			});
	}

	_execCommand(command)
	{
		if (this._closed)
		{
			command.reject(new InvalidStateError('Room closed'));
			return Promise.resolve();
		}

		const promiseHolder = { promise: null };

		this.emit('execcommand', command, promiseHolder);

		return promiseHolder.promise
			.then((result) =>
			{
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
