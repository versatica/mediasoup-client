/**
 * Clones the given object/array.
 *
 * @param {Object|Array} obj
 *
 * @returns {Object|Array}
 */
export function clone(data: any): any
{
	if (typeof data !== 'object')
		return {};

	return JSON.parse(JSON.stringify(data));
}

/**
 * Generates a random positive integer.
 */
export function generateRandomNumber(): number
{
	return Math.round(Math.random() * 10000000);
}
