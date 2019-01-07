/**
 * Clones the given object/array.
 *
 * @param {Object|Array} obj
 *
 * @returns {Object|Array}
 */
exports.clone = function(obj)
{
	if (typeof obj !== 'object')
		return {};

	return JSON.parse(JSON.stringify(obj));
};

/**
 * Generates a random positive integer.
 *
 * @returns {Number}
 */
exports.generateRandomNumber = function()
{
	return Math.round(Math.random() * 10000000);
};
