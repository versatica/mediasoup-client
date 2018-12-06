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

		// Queue for pending commands. Each command is an Object with method,
		// resolve, reject, and other members (depending the case).
		// @type {Array<Object>}
		this._commands = [];
	}

	close()
	{
		this._closed = true;

		for (const command of this._commands)
		{
			command._reject(new InvalidStateError('closed'));
		}

		this._commands = [];
	}

	push(command)
	{
		if (this._closed)
			return Promise.reject(new InvalidStateError('closed'));

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
		return command()
			.then((result) =>
			{
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
