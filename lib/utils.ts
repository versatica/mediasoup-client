/**
 * Clones the given object/array.
 *
 * @param {Object|Array} obj
 *
 * @returns {Object|Array}
 */
export function clone(obj: any): any
{
	if (typeof obj !== 'object')
		return {};

	return JSON.parse(JSON.stringify(obj));
}

/**
 * Generates a random positive integer.
 *
 * @returns {Number}
 */
export function generateRandomNumber(): number
{
	return Math.round(Math.random() * 10000000);
}
