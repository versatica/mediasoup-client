import bowser from 'bowser';
import Logger from './Logger';
import Chrome70 from './handlers/Chrome70';
import Chrome69 from './handlers/Chrome69';
import Chrome67 from './handlers/Chrome67';
import Chrome55 from './handlers/Chrome55';
import Safari12 from './handlers/Safari12';
import Safari11 from './handlers/Safari11';
import Firefox65 from './handlers/Firefox65';
import Firefox59 from './handlers/Firefox59';
import Firefox50 from './handlers/Firefox50';
import Edge11 from './handlers/Edge11';
import ReactNative from './handlers/ReactNative';

const logger = new Logger('deviceDetector');

export function getHandler()
{
	// React-Native.
	if (global.navigator && global.navigator.product === 'ReactNative')
	{
		return ReactNative;
	}
	// A browser.
	else if (
		global.navigator &&
		typeof global.navigator.userAgent === 'string' &&
		global.navigator.userAgent
	)
	{
		const ua = global.navigator.userAgent;

		// Chrome, Chromium (desktop and mobile).
		if (bowser.check({ chrome: '70', chromium: '70' }, true, ua))
		{
			return Chrome70;
		}
		else if (bowser.check({ chrome: '69', chromium: '69' }, true, ua))
		{
			return Chrome69;
		}
		else if (bowser.check({ chrome: '67', chromium: '67' }, true, ua))
		{
			return Chrome67;
		}
		else if (bowser.check({ chrome: '55', chromium: '55' }, true, ua))
		{
			return Chrome55;
		}
		// Opera (desktop and mobile).
		else if (bowser.check({ opera: '54' }, true, ua))
		{
			return Chrome70;
		}
		else if (bowser.check({ opera: '44' }, true, ua))
		{
			return Chrome55;
		}
		// Firefox (desktop and mobile).
		else if (bowser.check({ firefox: '65' }, true, ua))
		{
			return Firefox65;
		}
		// Firefox (desktop and mobile).
		else if (bowser.check({ firefox: '59' }, true, ua))
		{
			return Firefox59;
		}
		else if (bowser.check({ firefox: '50' }, true, ua))
		{
			return Firefox50;
		}
		// Safari (desktop and mobile).
		else if (bowser.check({ safari: '12.1' }, true, ua))
		{
			return Safari12;
		}
		else if (bowser.check({ safari: '11' }, true, ua))
		{
			return Safari11;
		}
		// Edge (desktop).
		else if (bowser.check({ msedge: '11' }, true, ua))
		{
			return Edge11;
		}
		// Unsupported browser.
		else
		{
			const browser = bowser.detect(ua);

			logger.debug(
				'getHandler() | browser not supported [name:%s, version:%s]',
				browser.name, browser.version);

			return null;
		}
	}
	// Unknown device.
	else
	{
		logger.debug('getHandler() | unknown device');

		return null;
	}
}
