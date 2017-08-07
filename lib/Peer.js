'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';

const logger = new Logger('Peer');

export default class Peer extends EnhancedEventEmitter
{
	/**
	 * User events:
	 *
	 * @emits {receiver: Receiver} newreceiver
	 * @emits {originator: String, [appData]: Any} closed
	 * @emits {originator: String} @close
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

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Map of Receivers indexed by id.
		// @type {map<Number, Receiver>}
		this._receivers = new Map();
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
	 * App custom data.
	 *
	 * @return {Any}
	 */
	get appData()
	{
		return this._appData;
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
	 * Closes the Peer.
	 * This is called when the local Room is closed.
	 *
	 * @private
	 */
	close()
	{
		logger.debug('close()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close', 'local');
		this.safeEmit('closed', 'local');

		// Close all the Receivers.
		for (let receiver of this._receivers.values())
		{
			receiver.close();
		}
	}

	/**
	 * The remote Peer or Room was closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close', 'remote');
		this.safeEmit('closed', 'remote', appData);

		// Close all the Receivers.
		for (let receiver of this._receivers.values())
		{
			receiver.remoteClose();
		}
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
		receiver.on('@close', () =>
		{
			this._receivers.delete(receiver.id);
		});

		// Emit event.
		this.safeEmit('newreceiver', receiver);
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
		return this._receivers.get(receiverId);
	}
}
