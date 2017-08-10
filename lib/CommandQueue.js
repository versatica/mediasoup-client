import { EventEmitter } from 'events';
import Logger from './Logger';
import { InvalidStateError } from './errors';

const logger = new Logger('CommandQueue');

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
		// @type {Boolean}
		this._busy = false;

		// Queue for pending commands. Each command is an Object with method,
		// resolve, reject, and other members (depending the case).
		// @type {Array<Object>}
		this._queue = [];
	}

	close()
	{
		this._closed = true;
	}

	push(method, data)
	{
		const command = Object.assign({ method }, data);

		logger.debug('push() [method:%s]', method);

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
		logger.debug('_handleCommand() [method:%s]', command.method);

		if (this._closed)
		{
			command.reject(new InvalidStateError('closed'));

			return Promise.resolve();
		}

		const promiseHolder = { promise: null };

		this.emit('exec', command, promiseHolder);

		return Promise.resolve()
			.then(() =>
			{
				return promiseHolder.promise;
			})
			.then((result) =>
			{
				logger.debug('_handleCommand() | command succeeded [method:%s]', command.method);

				if (this._closed)
				{
					command.reject(new InvalidStateError('closed'));

					return;
				}

				// Resolve the command with the given result (if any).
				command.resolve(result);
			})
			.catch((error) =>
			{
				logger.error(
					'_handleCommand() | command failed [method:%s]: %o', command.method, error);

				// Reject the command with the error.
				command.reject(error);
			});
	}
}
