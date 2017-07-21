/**
 * Error produced when calling a method in an invalid state.
 */
class InvalidStateError extends Error
{
	/**
	 * @ignore
	 */
	constructor(message)
	{
		super(message);

		/**
		 * @ignore
		 */
		this.name = 'InvalidStateError';
	}
}

export { InvalidStateError };
