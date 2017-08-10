import { EventEmitter } from 'events';
import Logger from './Logger';

const logger = new Logger('EnhancedEventEmitter');

export default class EnhancedEventEmitter extends EventEmitter
{
	constructor()
	{
		super();
		this.setMaxListeners(Infinity);
	}

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

	safeEmitAsPromise(...args)
	{
		return new Promise((resolve, reject) =>
		{
			const callback = (result) =>
			{
				resolve(result);
			};

			const errback = (error) =>
			{
				reject(error);
			};

			this.safeEmit(...args, callback, errback);
		});
	}
}
