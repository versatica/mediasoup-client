/* global RTCRtpTransceiver */

import * as bowser from 'bowser';
import Logger from './Logger';
// const Chrome74 = require('./handlers/Chrome74'); // Disabled for now.
import Chrome70 from './handlers/Chrome70';
import Chrome67 from './handlers/Chrome67';
import Chrome55 from './handlers/Chrome55';
import Firefox60 from './handlers/Firefox60';
import Safari12 from './handlers/Safari12';
import Safari11 from './handlers/Safari11';
import Edge11 from './handlers/Edge11';
import ReactNative from './handlers/ReactNative';

const logger = new Logger('detectDevice');

export default function(): any
{
	// React-Native.
	// NOTE: react-native-webrtc >= 1.75.0 is required.
	if (typeof navigator === 'object' && navigator.product === 'ReactNative')
	{
		if (typeof RTCPeerConnection === 'undefined')
		{
			logger.warn('unsupported ReactNative without RTCPeerConnection');

			return null;
		}

		return ReactNative;
	}
	// Browser.
	else if (typeof navigator === 'object' && typeof navigator.userAgent === 'string')
	{
		const ua = navigator.userAgent;
		const browser = bowser.getParser(ua);
		const engine = browser.getEngine();

		// Chrome and Chromium.
		// NOTE: Disable Chrome74 handler for now.
		// if (browser.satisfies({ chrome: '>=74', chromium: '>=74' }))
		// {
		// 	return Chrome74;
		// }
		if (browser.satisfies({ chrome: '>=70', chromium: '>=70' }))
		{
			return Chrome70;
		}
		else if (browser.satisfies({ chrome: '>=67', chromium: '>=67' }))
		{
			return Chrome67;
		}
		else if (browser.satisfies({ chrome: '>=55', chromium: '>=55' }))
		{
			return Chrome55;
		}
		// Firefox.
		else if (browser.satisfies({ firefox: '>=60' }))
		{
			return Firefox60;
		}
		// Safari with Unified-Plan support.
		else if (
			browser.satisfies({ safari: '>=12.1' }) &&
			typeof RTCRtpTransceiver !== 'undefined' &&
			RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
		)
		{
			return Safari12;
		}
		// Safari with Plab-B support.
		else if (browser.satisfies({ safari: '>=11' }))
		{
			return Safari11;
		}
		// Old Edge with ORTC support.
		else if (
			browser.satisfies({ 'microsoft edge': '>=11' }) &&
			browser.satisfies({ 'microsoft edge': '<=18' })
		)
		{
			return Edge11;
		}
		// Best effort for Chromium based browsers.
		else if (engine.name && engine.name.toLowerCase() === 'blink')
		{
			logger.debug('best effort Chromium based browser detection');

			const match = ua.match(/(?:(?:Chrome|Chromium))[ /](\w+)/i);

			if (match)
			{
				const version = Number(match[1]);

				// NOTE: Disable Chrome74 handler for now.
				// if (version >= 74)
				// 	return Chrome74;
				if (version >= 70)
					return Chrome70;
				else if (version >= 67)
					return Chrome67;
				else
					return Chrome55;
			}
			else
			{
				// NOTE: Disable Chrome74 handler for now.
				// return Chrome74;
				return Chrome70;
			}
		}
		// Unsupported browser.
		else
		{
			logger.warn(
				'browser not supported [name:%s, version:%s]',
				browser.getBrowserName(), browser.getBrowserVersion());

			return null;
		}
	}
	// Unknown device.
	else
	{
		logger.warn('unknown device');

		return null;
	}
}
