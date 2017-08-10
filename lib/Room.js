import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError, TimeoutError } from './errors';
import * as utils from './utils';
import Device from './Device';
import Transport from './Transport';
import Producer from './Producer';
import Peer from './Peer';
import Consumer from './Consumer';

const logger = new Logger('Room');

const RoomState =
{
	new     : 'new',
	joining : 'joining',
	joined  : 'joined',
	closed  : 'closed'
};

/**
 * An instance of Room represents a remote multi conference and a local
 * peer that joins it.
 */
export default class Room extends EnhancedEventEmitter
{
	/**
	 * Room class.
	 *
	 * @param {Object} [options]
	 * @param {Number} [options.requestTimeout=10000] - Timeout for sent requests
	 * (in milliseconds). Defaults to 10000 (10 seconds).
	 * @param {Object} [options.transportOptions] - Transport options for mediasoup.
	 * @param {Array<RTCIceServer>} [options.turnServers] - Array of TURN servers.
	 * @param {Boolean} [hidden=false] - If true no remote Peers will be notified.
	 *
	 * @throws {Error} if device is not supported.
	 *
	 * @emits {request: Object, callback: Function, errback: Function} request
	 * @emits {notification: Object} notify
	 * @emits {peer: Peer} newpeer
	 * @emits {originator: String, [appData]: Any} closed
	 */
	constructor(options)
	{
		logger.debug('constructor() [options:%o]', options);

		super();

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		options = options || {};

		// Computed settings.
		// @type {Object}
		this._settings =
		{
			requestTimeout   : options.requestTimeout || 10000,
			transportOptions : options.transportOptions || {},
			turnServers      : options.turnServers || [],
			hidden           : Boolean(options.hidden)
		};

		// Room state.
		// @type {Boolean}
		this._state = RoomState.new;

		// Map of Transports indexed by id.
		// @type {map<Number, Transport>}
		this._transports = new Map();

		// Map of Producers indexed by id.
		// @type {map<Number, Producer>}
		this._producers = new Map();

		// Map of Peers indexed by name.
		// @type {map<String, Peer>}
		this._peers = new Map();

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = null;

		// Whether we can send audio/video based on computed extended RTP
		// capabilities.
		// @type {Object}
		this._canSendByKind =
		{
			audio : false,
			video : false
		};
	}

	/**
	 * Whether the Room is joined.
	 *
	 * @return {Boolean}
	 */
	get joined()
	{
		return this._state === RoomState.joined;
	}

	/**
	 * Whether the Room is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._state === RoomState.closed;
	}

	/**
	 * The list of Transports.
	 *
	 * @return {Array<Transport>}
	 */
	get transports()
	{
		return Array.from(this._transports.values());
	}

	/**
	 * The list of Producers.
	 *
	 * @return {Array<Producer>}
	 */
	get producers()
	{
		return Array.from(this._producers.values());
	}

	/**
	 * The list of Peers.
	 *
	 * @return {Array<Peer>}
	 */
	get peers()
	{
		return Array.from(this._peers.values());
	}

	/**
	 * Start the procedures to join a remote room.
	 *
	 * @param {RTCRtpCapabilities} [roomRtpCapabilities] Remote room RTP capabilities.
	 * If given, no request is sent to the server to discover them.
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise}
	 */
	join(roomRtpCapabilities, appData)
	{
		if (!roomRtpCapabilities)
			logger.debug('join()');
		else
			logger.debug('join() [roomRtpCapabilities:%o]', roomRtpCapabilities);

		if (this._state !== RoomState.new)
		{
			return Promise.reject(
				new InvalidStateError(`invalid state "${this._state}"`));
		}

		this._state = RoomState.joining;

		let remoteRtpCapabilities;
		let localRtpCapabilities;

		return Promise.resolve()
			.then(() =>
			{
				if (roomRtpCapabilities)
					return roomRtpCapabilities;

				return this._sendRequest('queryRoom')
					.then((response) =>
					{
						const { rtpCapabilities } = response;

						logger.debug(
							'join() | got Room RTP capabilities:%o', rtpCapabilities);

						return rtpCapabilities;
					});
			})
			.then((rtpCapabilities) =>
			{
				remoteRtpCapabilities = rtpCapabilities;

				return Device.Handler.getLocalRtpCapabilities();
			})
			.then((rtpCapabilities) =>
			{
				localRtpCapabilities = rtpCapabilities;

				// Get extended RTP capabilities.
				this._extendedRtpCapabilities = utils.getExtendedRtpCapabilities(
					localRtpCapabilities, remoteRtpCapabilities);

				// Check whether we can send audio/video.
				this._canSendByKind.audio =
					utils.canSend('audio', this._extendedRtpCapabilities);
				this._canSendByKind.video =
					utils.canSend('video', this._extendedRtpCapabilities);

				// Generate our effective RTP capabilities for receiving media.
				const effectiveLocalRtpCapabilities =
					utils.getRtpCapabilities(this._extendedRtpCapabilities);

				logger.debug(
					'join() | effective local RTP capabilities:%o',
					effectiveLocalRtpCapabilities);

				const data =
				{
					rtpCapabilities : effectiveLocalRtpCapabilities,
					appData         : appData
				};

				return this._sendRequest('joinRoom', data)
					.then((response) => response.peers);
			})
			.then((peers) =>
			{
				if (!this._settings.hidden)
				{
					// Handle Peers already existing in the room.
					for (const peerData of peers || [])
					{
						try
						{
							this._handlePeerData(peerData);
						}
						catch (error)
						{
							logger.error('join() | error handling Peer:%o', error);
						}
					}
				}
				else if (peers.length > 0)
				{
					logger.error('join() | should not receive Peer list in hidden mode');
				}

				this._state = RoomState.joined;

				logger.debug('join() | joined the Room');

				// Return the list of already existing Peers.
				return this.peers;
			})
			.catch((error) =>
			{
				this._state = RoomState.new;

				throw error;
			});
	}

	/**
	 * Leave the Room.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	leave(appData)
	{
		logger.debug('leave()');

		if (this.closed)
			return;

		// Send a notification.
		this._sendNotification('leaveRoom', { appData });

		// Set closed state after sending the notification (otherwise the
		// notification won't be sent).
		this._state = RoomState.closed;

		this.safeEmit('closed', 'local', appData);

		// Close all the Transports.
		for (const transport of this._transports.values())
		{
			transport.close();
		}

		// Close all the Producers.
		for (const producer of this._producers.values())
		{
			producer.close();
		}

		// Close all the Peers.
		for (const peer of this._peers.values())
		{
			peer.close();
		}
	}

	/**
	 * The remote Room was closed or our remote Peer has been closed.
	 * Invoked via remote notification.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this.closed)
			return;

		this._state = RoomState.closed;

		this.safeEmit('closed', 'remote', appData);

		// Close all the Transports.
		for (const transport of this._transports.values())
		{
			transport.remoteClose();
		}

		// Close all the Producers.
		for (const producer of this._producers.values())
		{
			producer.remoteClose();
		}

		// Close all the Peers.
		for (const peer of this._peers.values())
		{
			peer.remoteClose();
		}
	}

	/**
	 * Whether we can send audio/video.
	 *
	 * @param {String} kind - 'audio' or 'video'.
	 *
	 * @return {Boolean}
	 */
	canSend(kind)
	{
		if (!this.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (kind !== 'audio' && kind !== 'video')
			throw new TypeError(`invalid kind "${kind}"`);

		return this._canSendByKind[kind];
	}

	/**
	 * Creates a Transport.
	 *
	 * @param {String} direction - Must be 'send' or 'recv'.
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Transport}
	 *
	 * @throws {InvalidStateError} if not joined.
	 * @throws {TypeError} if wrong arguments.
	 */
	createTransport(direction, appData)
	{
		logger.debug('createTransport() [direction:%s]', direction);

		if (!this.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (direction !== 'send' && direction !== 'recv')
			throw new TypeError(`invalid direction "${direction}"`);

		// Create a new Transport.
		const transport = new Transport(
			direction, this._extendedRtpCapabilities, this._settings, appData);

		// Store it.
		this._transports.set(transport.id, transport);

		transport.on('@request', (method, data, callback, errback) =>
		{
			this._sendRequest(method, data)
				.then(callback || function() {})
				.catch(errback || function() {});
		});

		transport.on('@notify', (method, data) =>
		{
			this._sendNotification(method, data);
		});

		transport.on('@close', () =>
		{
			this._transports.delete(transport.id);
		});

		return transport;
	}

	/**
	 * Creates a Producer.
	 *
	 * @param {MediaStreamTrack} track
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Producer}
	 *
	 * @throws {InvalidStateError} if not joined.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {Error} if cannot send the given kind.
	 */
	createProducer(track, appData)
	{
		logger.debug('createProducer() [track:%o]', track);

		if (!this.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (!(track instanceof MediaStreamTrack))
			throw new TypeError('track is not a MediaStreamTrack');
		else if (!this._canSendByKind[track.kind])
			throw new Error(`cannot send ${track.kind}`);
		else if (track.readyState === 'ended')
			throw new Error('track.readyState is "ended"');

		// Create a new Producer.
		const producer = new Producer(track, appData);

		// Store it.
		this._producers.set(producer.id, producer);

		producer.on('@close', () =>
		{
			this._producers.delete(producer.id);
		});

		return producer;
	}

	/**
	 * Get the Transport with the given id.
	 *
	 * @param {Number} id
	 *
	 * @return {Transport}
	 */
	getTransportById(id)
	{
		return this._transports.get(id);
	}

	/**
	 * Get the Producer with the given id.
	 *
	 * @param {Number} id
	 *
	 * @return {Producer}
	 */
	getProducerById(id)
	{
		return this._producers.get(id);
	}

	/**
	 * Get the Peer with the given name.
	 *
	 * @param {String} name
	 *
	 * @return {Peer}
	 */
	getPeerById(name)
	{
		return this._peers.get(name);
	}

	/**
	 * Provide the local Room with a notification generated by mediasoup server.
	 *
	 * @param {Object} notification
	 */
	receiveNotification(notification)
	{
		try
		{
			if (this.closed)
				throw new InvalidStateError('Room closed');
			else if (typeof notification !== 'object')
				throw new TypeError('wrong notification Object');
			else if (notification.notification !== true)
				throw new TypeError('not a notification');
			else if (typeof notification.method !== 'string')
				throw new TypeError('wrong/missing notification method');

			const method = notification.method;

			logger.debug(
				'receiveNotification() [method:%s, notification:%o]',
				method, notification);

			switch (method)
			{
				case 'roomClosed':
				{
					const { appData } = notification;

					this.remoteClose(appData);

					break;
				}

				case 'transportClosed':
				{
					const { id, appData } = notification;
					const transport = this._transports.get(id);

					if (!transport)
						throw new Error(`Transport does not exist [id:"${id}"]`);

					transport.remoteClose(appData);

					break;
				}

				case 'newPeer':
				{
					this._ensureNotHidden();

					const { name } = notification;

					if (this._peers.has(name))
						throw new Error(`Peer already exists [name:"${name}"]`);

					const peerData = notification;

					this._handlePeerData(peerData);

					break;
				}

				case 'peerClosed':
				{
					this._ensureNotHidden();

					const peerName = notification.name;
					const { appData } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					peer.remoteClose(appData);

					break;
				}

				case 'producerClosed':
				{
					const { id, appData } = notification;
					const producer = this._producers.get(id);

					if (!producer)
						throw new Error(`Producer not found [id:${id}]`);

					producer.remoteClose(appData);

					break;
				}

				case 'producerPaused':
				{
					const { id, appData } = notification;
					const producer = this._producers.get(id);

					if (!producer)
						throw new Error(`Producer not found [id:${id}]`);

					producer.remotePause(appData);

					break;
				}

				case 'producerResumed':
				{
					const { id, appData } = notification;
					const producer = this._producers.get(id);

					if (!producer)
						throw new Error(`Producer not found [id:${id}]`);

					producer.remoteResume(appData);

					break;
				}

				case 'newConsumer':
				{
					this._ensureNotHidden();

					const { peerName } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					const consumerData = notification;

					this._handleConsumerData(consumerData, peer);

					break;
				}

				case 'consumerClosed':
				{
					this._ensureNotHidden();

					const { id, peerName, appData } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					const consumer = peer.getConsumerById(id);

					if (!consumer)
						throw new Error(`Consumer not found [id:${id}]`);

					consumer.remoteClose(appData);

					break;
				}

				case 'consumerPaused':
				{
					this._ensureNotHidden();

					const { id, peerName, appData } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					const consumer = peer.getConsumerById(id);

					if (!consumer)
						throw new Error(`Consumer not found [id:${id}]`);

					consumer.remotePause(appData);

					break;
				}

				case 'consumerResumed':
				{
					this._ensureNotHidden();

					const { id, peerName, appData } = notification;
					const peer = this._peers.get(peerName);

					const consumer = peer.getConsumerById(id);

					if (!consumer)
						throw new Error(`Consumer not found [id:${id}]`);

					consumer.remoteResume(appData);

					break;
				}

				default:
					throw new Error(`unknown notification method "${method}"`);
			}
		}
		catch (error)
		{
			logger.error(
				'receiveNotification() failed [notification:%o]: %s',
				notification, error.toString());
		}
	}

	_sendRequest(method, data)
	{
		const request = Object.assign({ method }, data);

		// Should never happen.
		// Ignore if closed.
		if (this.closed)
		{
			logger.error(
				'_sendRequest() | Room closed [method:%s, request:%o]',
				method, request);

			return Promise.reject(new InvalidStateError('Room closed'));
		}

		logger.debug('_sendRequest() [method:%s, request:%o]', method, request);

		return new Promise((resolve, reject) =>
		{
			let done = false;

			const timer = setTimeout(() =>
			{
				logger.error(
					'request failed [method:%s]: timeout', method);

				done = true;
				reject(new TimeoutError('timeout'));
			}, this._settings.requestTimeout);

			// TODO: We could also handle room 'closed' event here.

			const callback = (response) =>
			{
				if (done)
					return;

				done = true;
				clearTimeout(timer);

				if (this.closed)
				{
					logger.error(
						'request failed [method:%s]: Room closed', method);

					reject(new Error('Room closed'));

					return;
				}

				logger.debug(
					'request succeeded [method:%s, response:%o]', method, response);

				resolve(response);
			};

			const errback = (message) =>
			{
				if (done)
					return;

				done = true;
				clearTimeout(timer);

				if (this.closed)
				{
					logger.error(
						'request failed [method:%s]: Room closed', method);

					reject(new Error('Room closed'));

					return;
				}

				// Make sure message is a String.
				message = String(message);

				logger.error(
					'request failed [method:%s]: %s', method, message);

				reject(new Error(message));
			};

			this.safeEmit('request', request, callback, errback);
		});
	}

	_sendNotification(method, data)
	{
		// Ignore if closed.
		if (this.closed)
			return;

		const notification = Object.assign({ method, notification: true }, data);

		logger.debug(
			'_sendNotification() [method:%s, notification:%o]', method, notification);

		this.safeEmit('notify', notification);
	}

	_ensureNotHidden()
	{
		if (this._settings.hidden)
			throw new Error('hidden mode set');
	}

	_handlePeerData(peerData)
	{
		const { name, consumers, appData } = peerData;
		const peer = new Peer(name, appData);

		// Store it.
		this._peers.set(peer.name, peer);

		peer.on('@close', () =>
		{
			this._peers.delete(peer.name);
		});

		// Add consumers.
		for (const consumerData of consumers)
		{
			try
			{
				this._handleConsumerData(consumerData, peer);
			}
			catch (error)
			{
				logger.error('error handling existing Consumer in Peer:%o', error);
			}
		}

		// If already joined emit event.
		if (this.joined)
			this.safeEmit('newpeer', peer);
	}

	_handleConsumerData(producerData, peer)
	{
		const { id, kind, rtpParameters, paused, appData } = producerData;
		const consumer = new Consumer(id, kind, rtpParameters, appData);
		const supported =
			utils.canReceive(consumer.rtpParameters, this._extendedRtpCapabilities);

		if (supported)
			consumer.setSupported(true);

		if (paused)
			consumer.remotePause();

		peer.addConsumer(consumer);
	}
}
