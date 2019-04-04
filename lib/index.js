const { version } = require('../package.json');
const Device = require('./Device');
const parseScalabilityMode = require('./scalabilityModes').parse;

/**
 * Expose mediasoup-client version.
 *
 * @type {String}
 */
exports.version = version;

/**
 * Expose Device class.
 *
 * @type {Class}
 */
exports.Device = Device;

/**
 * Expose parseScalabilityMode function.
 *
 * @type {Function}
 */
exports.parseScalabilityMode = parseScalabilityMode;
