'use strict';

import bowser from 'bowser';
import Logger from './Logger';
import * as handlers from './handlers';

const logger = new Logger('Device');

/**
 * Class with static members representing the underlying device or browser.
 * @ignore
 */
export default class Device
{
	/**
	 * Get the device name.
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
	 */
	static _detect()
	{
		const ua = global.navigator.userAgent;
		const browser = bowser._detect(ua);

		Device._detected = true;
		Device._name = browser.name || 'unknown device';
		Device._version = browser.version || 'unknown vesion';
		Device._handlerClass = null;

		// Chrome, Chromium, Opera.
		// Desktop and mobile.
		if (bowser.check({ chrome:'55', chromium:'55', opera:'44' }, true, ua))
		{
			Device._handlerClass = handlers.Chrome_55;
		}

		// TODO: Others.
		else if (bowser.check({ safari:'11' }, true, ua))
		{
			Device._handlerClass = handlers.Chrome_55;
		}

		logger.debug(
			'_detect() [name:%s, version:%s, handler:%s]',
			Device._name, Device._version,
			Device._handlerClass ? Device._handlerClass.name : 'none');
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
