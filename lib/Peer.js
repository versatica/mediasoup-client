import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';

const logger = new Logger('Peer');

export default class Peer extends EnhancedEventEmitter
{
	/**
	 * @private
	 *
	 * @emits {consumer: Consumer} newconsumer
	 * @emits {originator: String, [appData]: Any} close
	 *
	 * @emits @close
	 */
	constructor(name, appData)
	{
		super(logger);

		// Name.
		// @type {String}
		this._name = name;

		// Closed flag.
		// @type {Boolean}
		this._closed = false;

		// App custom data.
		// @type {Any}
		this._appData = appData;

		// Map of Consumers indexed by id.
		// @type {map<Number, Consumer>}
		this._consumers = new Map();
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
	 * The list of Consumers.
	 *
	 * @return {Array<Consumer>}
	 */
	get consumers()
	{
		return Array.from(this._consumers.values());
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

		this.emit('@close');
		this.safeEmit('close', 'local');

		// Close all the Consumers.
		for (const consumer of this._consumers.values())
		{
			consumer.close();
		}
	}

	/**
	 * The remote Peer or Room was closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this._closed)
			return;

		this._closed = true;

		this.emit('@close');
		this.safeEmit('close', 'remote', appData);

		// Close all the Consumers.
		for (const consumer of this._consumers.values())
		{
			consumer.remoteClose();
		}
	}

	/**
	 * Get the Consumer with the given id.
	 *
	 * @param {Number} id
	 *
	 * @return {Consumer}
	 */
	getConsumerById(id)
	{
		return this._consumers.get(id);
	}

	/**
	 * Add an associated Consumer.
	 *
	 * @private
	 *
	 * @param {Consumer} consumer
	 */
	addConsumer(consumer)
	{
		if (this._consumers.has(consumer.id))
			throw new Error(`Consumer already exists [id:${consumer.id}]`);

		// Store it.
		this._consumers.set(consumer.id, consumer);

		// Handle it.
		consumer.on('@close', () =>
		{
			this._consumers.delete(consumer.id);
		});

		// Emit event.
		this.safeEmit('newconsumer', consumer);
	}
}
