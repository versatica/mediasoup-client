import * as ortc from './ortc';
import Device from './Device';
import Room from './Room';
import * as internals from './internals';

/**
 * Provides a custom RTC handler class and avoid auto-detection. Useful
 * for making mediasoup-client work with custom devices.
 *
 * NOTE: This function must be called upon library load.
 *
 * @param {Class} handler - A handler class.
 * @param {Object} [metadata] - Handler metadata.
 * @param {String} [metadata.flag] - Handler flag.
 * @param {String} [metadata.name] - Handler name.
 * @param {String} [metadata.version] - Handler version.
 * @param {Object} [metadata.bowser] - Handler bowser Object.
 */
export function setDeviceHandler(handler, metadata)
{
	Device.setHandler(handler, metadata);
}

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
 * // => { flag: 'chrome', name: 'Chrome', version: '59.0', bowser: {} }
 */
export function getDeviceInfo()
{
	return {
		flag    : Device.getFlag(),
		name    : Device.getName(),
		version : Device.getVersion(),
		bowser  : Device.getBowser()
	};
}

/**
 * Check whether this device/browser can send/receive audio/video in a room
 * whose RTP capabilities are given.
 *
 * @param {Object} Room RTP capabilities.
 *
 * @return {Promise} Resolves to an Object with 'audio' and 'video' Booleans.
 */
export function checkCapabilitiesForRoom(roomRtpCapabilities)
{
	if (!Device.isSupported())
		return Promise.reject(new Error('current browser/device not supported'));

	return Device.Handler.getNativeRtpCapabilities()
		.then((nativeRtpCapabilities) =>
		{
			const extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
				nativeRtpCapabilities, roomRtpCapabilities);

			return {
				audio : ortc.canSend('audio', extendedRtpCapabilities),
				video : ortc.canSend('video', extendedRtpCapabilities)
			};
		});
}

/**
 * Expose the Room class.
 *
 * @example
 * const room = new Room();`
 */
export { Room };

/**
 * Expose internals.
 */
export { internals };
