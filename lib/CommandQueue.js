const Logger = require('./Logger');
const { InvalidStateError } = require('./errors');

const logger = new Logger('CommandQueue');

class CommandQueue
{
	constructor()
	{
		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Busy running a command.
		// @type {Boolean}
		this._busy = false;

		// Queue of pending commands. Each command is a function that returns a
		// promise.
		// @type {Array<Function>}
		this._commands = [];
	}

	close()
	{
		this._closed = true;
	}

	push(command)
	{
		if (typeof command !== 'function')
		{
			logger.error('push() | given command is not a function: %o', command);

			return Promise.reject(new TypeError('given command is not a function'));
		}

		return new Promise((resolve, reject) =>
		{
			command._resolve = resolve;
			command._reject = reject;

			// Append command to the queue.
			this._commands.push(command);

			// And run it if not busy.
			if (!this._busy)
				this._next();
		});
	}

	_next()
	{
		// Take the first command.
		const command = this._commands[0];

		if (!command)
			return;

		this._busy = true;

		// Execute it.
		this._handleCommand(command)
			.then(() =>
			{
				this._busy = false;

				// Remove the first command (the completed one) from the queue.
				this._commands.shift();

				// And continue.
				this._next();
			});
	}

	_handleCommand(command)
	{
		if (this._closed)
		{
			command._reject(new InvalidStateError('closed'));

			return Promise.resolve();
		}

		const promise = command();

		if (!promise || typeof promise.then !== 'function')
		{
			logger.error(
				'_handleCommand() | command does not return a promise: %o', promise);

			return Promise.reject(new TypeError('command does not return a promise'));
		}

		return promise
			.then((result) =>
			{
				if (this._closed)
				{
					command._reject(new InvalidStateError('closed'));

					return;
				}

				// Resolve the command with the given result (if any).
				command._resolve(result);
			})
			.catch((error) =>
			{
				logger.error('_handleCommand() failed: %o', error);

				// Reject the command with the error.
				command._reject(error);
			});
	}
}

module.exports = CommandQueue;
