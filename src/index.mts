import debug from 'debug';

/**
 * Expose all types.
 */
export * as types from './types.mts';

/**
 * Expose mediasoup-client version.
 */
export const version = '__MEDIASOUP_CLIENT_VERSION__';

/**
 * Expose Device class and detectDevice() helper.
 */
export { Device, detectDevice } from './Device.mts';

/**
 * Expose parseScalabilityMode() function.
 */
export { parse as parseScalabilityMode } from './scalabilityModes.mts';

/**
 * Expose the debug module.
 */
export { debug };
