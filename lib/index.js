const { version } = require('../package.json');
const Device = require('./Device');

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
