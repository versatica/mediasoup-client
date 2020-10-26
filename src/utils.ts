/**
 * Clones the given data.
 */
export function clone(data: any, defaultValue: any): any
{

	if (typeof data === 'undefined')
		return defaultValue;

	return JSON.parse(JSON.stringify(data));
}

/**
 * Generates a random positive integer.
 */
export function generateRandomNumber(): number
{
	return Math.round(Math.random() * 10000000);
}
