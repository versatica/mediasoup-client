const SPATIAL_LAYERS = new Set([ 'low', 'medium', 'high' ]);

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

/**
 * Validates given spatial layer.
 *
 * @param {String} spatialLayer
 * @param {Boolean} [optional] - null or undefined is a valid value.
 * @param {Boolean} [allowDefault] - "default" is a valid value.
 * @param {Boolean} [allowNone] - "none" is a valid value.
 *
 * @return {Boolean}
 */
exports.isValidSpatialLayer = function(
	spatialLayer,
	{ optional, allowDefault, allowNone } = {}
)
{
	return (
		(optional && !spatialLayer) ||
		SPATIAL_LAYERS.has(spatialLayer) ||
		(allowDefault && spatialLayer === 'default') ||
		(allowNone && spatialLayer === 'none')
	);
};
