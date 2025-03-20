import debug from 'debug';

/**
 * Expose all types.
 */
export * as types from './types';

/**
 * Expose mediasoup-client version.
 */
export const version = '__MEDIASOUP_CLIENT_VERSION__';

/**
 * Expose Device class and detectDevice() helper.
 */
export { Device, detectDevice } from './Device';

/**
 * Expose parseScalabilityMode() function.
 */
export { parse as parseScalabilityMode } from './scalabilityModes';

/**
 * Expose FakeHandler.
 */
export { FakeHandler } from './handlers/FakeHandler';

/**
 * Expose test/fakeParameters utils.
 */
export * as testFakeParameters from './test/fakeParameters';

/**
 * Expose the debug module.
 */
export { debug };
