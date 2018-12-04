/**
 * Clones the given Object/Array.
 *
 * @param {Object|Array} obj
 *
 * @return {Object|Array}
 */
exports.clone = function(obj)
{
	return JSON.parse(JSON.stringify(obj));
};

/**
 * Generates a random positive integer.
 *
 * @return {Number}
 */
exports.generateRandomNumber = function()
{
	return Math.round(Math.random() * 10000000);
};
