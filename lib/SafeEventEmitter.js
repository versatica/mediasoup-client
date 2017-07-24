'use strict';

import { EventEmitter } from 'events';
import Logger from './Logger';

const logger = new Logger('SafeEventEmitter');

/**
 * @ignore
 */
export default class SafeEventEmitter extends EventEmitter
{
	safeEmit(event, ...args)
	{
		try
		{
			this.emit(event, ...args);
		}
		catch (error)
		{
			logger.error('event listener threw an error [event:%s]: %o',
				event, error);
		}
	}
}
