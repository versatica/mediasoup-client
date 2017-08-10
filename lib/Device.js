import bowser from 'bowser';
import Logger from './Logger';
import Chrome55 from './handlers/Chrome55';
import Safari11 from './handlers/Safari11';
import Firefox50 from './handlers/Firefox50';
import Edge11 from './handlers/Edge11';

const logger = new Logger('Device');

/**
 * Class with static members representing the underlying device or browser.
 */
export default class Device
{
	/**
	 * Get the device name.
	 *
	 * @return {String}
	 */
	static get name()
	{
		if (!Device._detected)
			Device._detect();

		return Device._name;
	}

	/**
	 * Get the device version.
	 *
	 * @return {String}
	 */
	static get version()
	{
		if (!Device._detected)
			Device._detect();

		return Device._version;
	}

	/**
	 * Whether this device is supported.
	 *
	 * @return {Boolean}
	 */
	static isSupported()
	{
		if (!Device._detected)
			Device._detect();

		return Boolean(Device._handlerClass);
	}

	/**
	 * Returns a suitable WebRTC handler class.
	 *
	 * @type {Class}
	 */
	static get Handler()
	{
		if (!Device._detected)
			Device._detect();

		return Device._handlerClass;
	}

	/**
	 * Detects the current device/browser.
	 *
	 * @private
	 */
	static _detect()
	{
		const ua = global.navigator.userAgent;
		const browser = bowser._detect(ua);

		Device._detected = true;
		Device._name = browser.name || 'unknown device';
		Device._version = browser.version || 'unknown vesion';
		Device._handlerClass = null;

		// Chrome, Chromium, Opera (desktop and mobile).
		if (bowser.check({ chrome: '55', chromium: '55', opera: '44' }, true, ua))
		{
			Device._handlerClass = Chrome55;
		}
		// Safari (desktop and mobile).
		else if (bowser.check({ safari: '11' }, true, ua))
		{
			Device._handlerClass = Safari11;
		}
		// Firefox (desktop and mobile).
		else if (bowser.check({ firefox: '50' }, true, ua))
		{
			Device._handlerClass = Firefox50;
		}
		// Edge (desktop).
		else if (bowser.check({ msedge: '11' }, true, ua))
		{
			Device._handlerClass = Edge11;
		}

		// TODO: More devices.

		if (Device.isSupported())
		{
			logger.debug(
				'device supported [name:%s, version:%s, handler:%s]',
				Device._name, Device._version, Device._handlerClass.name);
		}
		else
		{
			logger.warn(
				'device not supported [name:%s, version:%s]',
				Device._name, Device._version);
		}
	}
}

// Initialized flag.
// @type {Boolean}
Device._detected = false;

// Device name.
// @type {String}
Device._name = undefined;

// Device version.
// @type {String}
Device._version = undefined;

// WebRTC hander for this device.
// @type {Class}
Device._handlerClass = null;
