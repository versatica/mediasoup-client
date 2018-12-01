/**
 * Clones the given Object/Array.
 *
 * @param {Object|Array} obj
 *
 * @return {Object|Array}
 */
export function clone(obj)
{
	return JSON.parse(JSON.stringify(obj));
}

export function generateRandomNumber()
{
	return Math.round(Math.random() * 10000000);
}
