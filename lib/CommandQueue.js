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

		// Queue of pending commands. Each command is a function that returns a
		// promise.
		// @type {Array<Function>}
		this._commands = [];
	}

	close()
	{
		this._closed = true;
	}

	/**
	 * @param {Function} command - Function that returns a promise.
	 *
	 * @async
	 */
	async push(command)
	{
		if (typeof command !== 'function')
		{
			logger.error('push() | given command is not a function: %o', command);

			throw new TypeError('given command is not a function');
		}

		return new Promise((resolve, reject) =>
		{
			command._resolve = resolve;
			command._reject = reject;

			// Append command to the queue.
			this._commands.push(command);

			// And run it if the only command in the queue is the new one.
			if (this._commands.length === 1)
				this._next();
		});
	}

	async _next()
	{
		// Take the first command.
		const command = this._commands[0];

		if (!command)
			return;

		// Execute it.
		await this._handleCommand(command);

		// Remove the first command (the completed one) from the queue.
		this._commands.shift();

		// And continue.
		this._next();
	}

	async _handleCommand(command)
	{
		if (this._closed)
		{
			command._reject(new InvalidStateError('closed'));

			return;
		}

		try
		{
			const result = await command();

			if (this._closed)
			{
				command._reject(new InvalidStateError('closed'));

				return;
			}

			// Resolve the command with the given result (if any).
			command._resolve(result);
		}
		catch (error)
		{
			logger.error('_handleCommand() failed: %o', error);

			// Reject the command with the error.
			command._reject(error);
		}
	}
}

module.exports = CommandQueue;
