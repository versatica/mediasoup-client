const SPATIAL_LAYERS = new Set([ 'low', 'medium', 'high' ]);

/**
 * Clones the given Object/Array.
 *
 * @param {Object|Array} obj
 *
 * @returns {Object|Array}
 */
exports.clone = function(obj)
{
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

/**
 * Validates given spatial layer.
 *
 * @param {String} spatialLayer
 * @param {Boolean} [optional] - null or undefined is a valid value.
 *
 * @returns {Boolean}
 */
exports.isValidSpatialLayer = function(spatialLayer, { optional } = {})
{
	return (
		(optional && !spatialLayer) ||
		SPATIAL_LAYERS.has(spatialLayer)
	);
};
