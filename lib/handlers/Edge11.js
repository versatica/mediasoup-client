'use strict';

import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';

const logger = new Logger('Edge11');

export default class Edge11 extends EnhancedEventEmitter
{
	static get name()
	{
		return 'Edge11';
	}

	static getLocalRtpCapabilities()
	{
		logger.debug('getLocalRtpCapabilities()');

		// TODO
	}

	constructor(direction, extendedRtpCapabilities, settings)
	{
		logger.debug(
			'constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		super();

		// TODO: TMP
		this._settings = settings;

		// TODO
	}

	close()
	{
		logger.debug('close()');

		// TODO
	}

	addSender(sender)
	{
		const { track } = sender;

		logger.debug(
			'addSender() [id:%s, kind:%s, trackId:%s]',
			sender.id, sender.kind, track.id);

		// TODO
	}

	removeSender(sender)
	{
		const { track } = sender;

		logger.debug(
			'removeSender() [id:%s, kind:%s, trackId:%s]',
			sender.id, sender.kind, track.id);

		// TODO
	}

	addReceiver(receiver)
	{
		logger.debug(
			'addReceiver() [id:%s, kind:%s]', receiver.id, receiver.kind);

		// TODO
	}

	removeReceiver(receiver)
	{
		logger.debug(
			'removeReceiver() [id:%s, kind:%s]', receiver.id, receiver.kind);

		// TODO
	}
}
