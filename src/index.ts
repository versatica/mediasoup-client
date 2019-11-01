import Device from './Device';
import * as types from './types';

/**
 * Expose all types.
 */
export { types };

/**
 * Expose mediasoup-client version.
 */
export const version = '__MEDIASOUP_CLIENT_VERSION__';

/**
 * Expose Device class.
 */
export { Device };

/**
 * Expose parseScalabilityMode() function.
 */
export { parse as parseScalabilityMode } from './scalabilityModes';
