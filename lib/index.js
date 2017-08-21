import Device from './Device';
import Room from './Room';

/**
 * Whether the current browser or device is supported.
 *
 * @return {Boolean}
 *
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
 *
 * @return {Object} - Object with `name` (String) and version {String}.
 *
 * @example
 * getDeviceInfo()
 * // => { flag: 'chrome', name: 'Chrome', version: '59.0' }
 */
export function getDeviceInfo()
{
	return {
		flag    : Device.flag,
		name    : Device.name,
		version : Device.version
	};
}

/**
 * Expose the Room class.
 *
 * @example
 * const room = new Room();`
 */
export { Room };
