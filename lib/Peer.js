'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';

const logger = new Logger('Peer');

export default class Peer extends EnhancedEventEmitter
{
	/**
	 * @emits {function(receiver: Receiver)} newreceiver
	 * @emits {function(appData: Any)} close
	 */
	constructor(name, appData)
	{
		super();

		// Name.
		// @type {String}
		this._name = name;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// Map of Receivers indexed by id.
		// @type {map<Number, Receiver>}
		this._receivers = new Map();

		// App custom data.
		// @type {Any}
		this._appData = appData;
	}

	/**
	 * Peer name.
	 *
	 * @return {String}
	 */
	get name()
	{
		return this._name;
	}

	/**
	 * Whether the Peer is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._closed;
	}

	/**
	 * The list of Receivers.
	 *
	 * @return {Array<Receiver>}
	 */
	get receivers()
	{
		return Array.from(this._receivers.values());
	}

	/**
	 * App custom data.
	 *
	 * @return {Any}
	 */
	get appData()
	{
		return this._appData;
	}

	/**
	 * Closes the Peer and its Receivers.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		// Close all the Receivers.
		for (let receiver of this._receivers.values())
		{
			receiver.close(appData);
		}
		this._receivers.clear();

		this.safeEmit('close', appData);
	}

	/**
	 * Add an associated Receiver.
	 *
	 * @private
	 * @param {Receiver} receiver
	 */
	addReceiver(receiver)
	{
		if (this._receivers.has(receiver.id))
			throw new Error(`Receiver already exists [id:${receiver.id}]`);

		// Store it.
		this._receivers.set(receiver.id, receiver);

		// Handle it.
		receiver.on('close', () =>
		{
			this._receivers.delete(receiver.id);
		});

		// Emit event.
		this.safeEmit('newreceiver', receiver);
	}

	/**
	 * Close an associated Receiver.
	 *
	 * @private
	 * @param {Number} receiverId
	 * @param {Any} appData
	 */
	closeReceiver(receiverId, appData)
	{
		const receiver = this._receivers.get(receiverId);

		if (!receiver)
			throw new Error(`Receiver not found [id:${receiverId}]`);

		receiver.close(appData);
	}

	/**
	 * Pauses an associated Receiver.
	 *
	 * @private
	 * @param {Number} receiverId
	 * @param {Any} appData
	 */
	pauseReceiver(receiverId, appData)
	{
		const receiver = this._receivers.get(receiverId);

		if (!receiver)
			throw new Error(`Receiver not found [id:${receiverId}]`);

		receiver.setPaused(true, appData);
	}

	/**
	 * Resumes an associated Receiver.
	 *
	 * @private
	 * @param {Number} receiverId
	 * @param {Any} appData
	 */
	resumeReceiver(receiverId, appData)
	{
		const receiver = this._receivers.get(receiverId);

		if (!receiver)
			throw new Error(`Receiver not found [id:${receiverId}]`);

		receiver.setPaused(false, appData);
	}

	/**
	 * Get the Receiver with the given id.
	 *
	 * @private
	 * @param {Number} id
	 * @return {Receiver}
	 */
	getReceiverById(receiverId)
	{
		return this._receivers.has(receiverId);
	}
}
