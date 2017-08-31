import randomNumberLib from 'random-number';

const randomNumberGenerator = randomNumberLib.generator(
	{
		min     : 10000000,
		max     : 99999999,
		integer : true
	});

/**
 * Generates a random positive number between 10000000 and 99999999.
 *
 * @return {Number}
 */
export function randomNumber()
{
	return randomNumberGenerator();
}

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
