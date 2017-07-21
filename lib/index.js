'use strict';

/**
 * The lalala
 */

import Device from './Device';
import Room from './Room';

/**
 * Whether the current browser or device is supported.
 * @return {Boolean}

 * @example
 * isDeviceSupported()
 * // => true
 */
export function isDeviceSupported()
{
	return Device.isSupported();
}

/**
 * Get information regarding the current browser or device.
 * @return {Object} - Object with `name` (String) and version {String}.
 *
 * @example
 * getDeviceInfo()
 * // => { name: "Chrome", version: "59.0" }
 */
export function getDeviceInfo()
{
	return {
		name    : Device.name,
		version : Device.version
	};
}

/**
 * Expose the Room class.
 */
export { Room };
