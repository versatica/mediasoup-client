import bowser from 'bowser';
import Logger from './Logger';
import Chrome69 from './handlers/Chrome69';
import Chrome67 from './handlers/Chrome67';
import Chrome55 from './handlers/Chrome55';
import Safari12 from './handlers/Safari12';
import Safari11 from './handlers/Safari11';
import Firefox59 from './handlers/Firefox59';
import Firefox50 from './handlers/Firefox50';
import Edge11 from './handlers/Edge11';
import ReactNative from './handlers/ReactNative';

const logger = new Logger('Device');

/**
 * Class with static members representing the underlying device or browser.
 */
export default class Device
{
	/**
	 * Get the device flag.
	 *
	 * @return {String}
	 */
	static getFlag()
	{
		if (!Device._detected)
			Device._detect();

		return Device._flag;
	}

	/**
	 * Get the device name.
	 *
	 * @return {String}
	 */
	static getName()
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
	static getVersion()
	{
		if (!Device._detected)
			Device._detect();

		return Device._version;
	}

	/**
	 * Get the bowser module Object.
	 *
	 * @return {Object}
	 */
	static getBowser()
	{
		if (!Device._detected)
			Device._detect();

		return Device._bowser;
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
		Device._detected = true;

		// If this is React-Native manually fill data.
		if (global.navigator && global.navigator.product === 'ReactNative')
		{
			Device._flag = 'react-native';
			Device._name = 'ReactNative';
			Device._version = undefined; // NOTE: No idea how to know it.
			Device._bowser = {};
			Device._handlerClass = ReactNative;
		}
		// If this is a browser use bowser module detection.
		else if (global.navigator && typeof global.navigator.userAgent === 'string')
		{
			const ua = global.navigator.userAgent;
			const browser = bowser.detect(ua);

			Device._flag = undefined;
			Device._name = browser.name || undefined;
			Device._version = browser.version || undefined;
			Device._bowser = browser;
			Device._handlerClass = null;

			// Chrome, Chromium (desktop and mobile).
			if (bowser.check({ chrome: '69', chromium: '69' }, true, ua))
			{
				Device._flag = 'chrome';
				Device._handlerClass = Chrome69;
			}
			else if (bowser.check({ chrome: '67', chromium: '67' }, true, ua))
			{
				Device._flag = 'chrome';
				Device._handlerClass = Chrome67;
			}
			else if (bowser.check({ chrome: '55', chromium: '55' }, true, ua))
			{
				Device._flag = 'chrome';
				Device._handlerClass = Chrome55;
			}
			// Firefox (desktop and mobile).
			else if (bowser.check({ firefox: '59' }, true, ua))
			{
				Device._flag = 'firefox';
				Device._handlerClass = Firefox59;
			}
			else if (bowser.check({ firefox: '50' }, true, ua))
			{
				Device._flag = 'firefox';
				Device._handlerClass = Firefox50;
			}
			// Safari (desktop and mobile).
			else if (bowser.check({ safari: '12.1' }, true, ua))
			{
				Device._flag = 'safari';
				Device._handlerClass = Safari12;
			}
			else if (bowser.check({ safari: '11' }, true, ua))
			{
				Device._flag = 'safari';
				Device._handlerClass = Safari11;
			}
			// Edge (desktop).
			else if (bowser.check({ msedge: '11' }, true, ua))
			{
				Device._flag = 'msedge';
				Device._handlerClass = Edge11;
			}
			// Opera (desktop and mobile).
			if (bowser.check({ opera: '44' }, true, ua))
			{
				Device._flag = 'opera';
				Device._handlerClass = Chrome55;
			}

			if (Device.isSupported())
			{
				logger.debug(
					'browser supported [flag:%s, name:"%s", version:%s, handler:%s]',
					Device._flag, Device._name, Device._version, Device._handlerClass.tag);
			}
			else
			{
				logger.warn(
					'browser not supported [name:%s, version:%s]',
					Device._name, Device._version);
			}
		}
		// Otherwise fail.
		else
		{
			logger.warn('device not supported');
		}
	}
}

// Initialized flag.
// @type {Boolean}
Device._detected = false;

// Device flag.
// @type {String}
Device._flag = undefined;

// Device name.
// @type {String}
Device._name = undefined;

// Device version.
// @type {String}
Device._version = undefined;

// bowser module Object.
// @type {Object}
Device._bowser = undefined;

// WebRTC hander for this device.
// @type {Class}
Device._handlerClass = null;
