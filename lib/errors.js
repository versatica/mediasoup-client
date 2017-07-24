/**
 * Error produced when calling a method in an invalid state.
 */
class InvalidStateError extends Error
{
	constructor(message)
	{
		super(message);

		Object.defineProperty(this, 'name',
			{
				enumerable : false,
				writable   : false,
				value      : 'InvalidStateError'
			});

		if (Error.hasOwnProperty('captureStackTrace')) // Just in V8.
		{
			Error.captureStackTrace(this, InvalidStateError);
		}
		else
		{
			Object.defineProperty(this, 'stack',
				{
					enumerable : false,
					writable   : false,
					value      : (new Error(message)).stack
				});
		}
	}
}

/**
 * Error produced when a Promise is rejected due to a timeout.
 */
class TimeoutError extends Error
{
	constructor(message)
	{
		super(message);

		Object.defineProperty(this, 'name',
			{
				enumerable : false,
				writable   : false,
				value      : 'TimeoutError'
			});

		if (Error.hasOwnProperty('captureStackTrace')) // Just in V8.
		{
			Error.captureStackTrace(this, TimeoutError);
		}
		else
		{
			Object.defineProperty(this, 'stack',
				{
					enumerable : false,
					writable   : false,
					value      : (new Error(message)).stack
				});
		}
	}
}

export { InvalidStateError, TimeoutError };
