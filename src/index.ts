import Device from './Device';
import { parse as parseScalabilityMode } from './scalabilityModes';

/**
 * Expose mediasoup version.
 */
export const version = '__MEDIASOUP_CLIENT_VERSION__';

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
