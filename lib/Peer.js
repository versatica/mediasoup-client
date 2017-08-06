'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';

const logger = new Logger('Peer');

export default class Peer extends EnhancedEventEmitter
{
	/**
	 * @emits {function(receiver: Receiver)} newreceiver
	 * @emits {function(appData: Any)} leave
	 */
	constructor(name, appData)
	{
		super();

		// Name.
		// @type {String}
		this._name = name;

		// Left flag.
		// @type {Boolean}
		this._left = false;

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
	 * Whether the Peer has left the Room.
	 *
	 * @return {Boolean}
	 */
	get left()
	{
		return this._left;
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
	 * Notifies that the remote Peer left the Room.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	leave(appData)
	{
		logger.debug('leave()');

		if (this._left)
			return;

		this._left = true;

		// Close all the Receivers.
		for (let receiver of this._receivers.values())
		{
			receiver.close(appData);
		}
		this._receivers.clear();

		this.safeEmit('leave', appData);
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
