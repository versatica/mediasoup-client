import debug from 'debug';
import { Device, detectDevice } from './Device.mts';
import * as types from './types.mts';

/**
 * Expose all types.
 */
export { types };

/**
 * Expose mediasoup-client version.
 */
export const version = '__MEDIASOUP_CLIENT_VERSION__';

/**
 * Expose Device class and detectDevice() helper.
 */
export { Device, detectDevice };

/**
 * Expose parseScalabilityMode() function.
 */
export { parse as parseScalabilityMode } from './scalabilityModes.mts';

/**
 * Expose the debug module.
 */
export { debug };
