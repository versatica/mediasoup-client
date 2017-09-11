import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError, TimeoutError, UnsupportedError } from './errors';
import * as ortc from './ortc';
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
	 * @param {Object} [roomSettings] Remote room settings, including its RTP
	 * capabilities, mandatory codecs, etc. If given, no 'queryRoom' request is sent
	 * to the server to discover them.
	 * @param {Number} [options.requestTimeout=10000] - Timeout for sent requests
	 * (in milliseconds). Defaults to 10000 (10 seconds).
	 * @param {Object} [options.transportOptions] - Options for Transport created in mediasoup.
	 * @param {Array<RTCIceServer>} [options.turnServers] - Array of TURN servers.
	 *
	 * @throws {Error} if device is not supported.
	 *
	 * @emits {request: Object, callback: Function, errback: Function} request
	 * @emits {notification: Object} notify
	 * @emits {peer: Peer} newpeer
	 * @emits {originator: String, [appData]: Any} close
	 */
	constructor(options)
	{
		super(logger);

		logger.debug('constructor() [options:%o]', options);

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		options = options || {};

		// Computed settings.
		// @type {Object}
		this._settings =
		{
			roomSettings     : options.roomSettings,
			requestTimeout   : options.requestTimeout || 10000,
			transportOptions : options.transportOptions || {},
			turnServers      : options.turnServers || []
		};

		// Room state.
		// @type {Boolean}
		this._state = RoomState.new;

		// My mediasoup Peer name.
		// @type {String}
		this._peerName = null;

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
	 * My mediasoup Peer name.
	 *
	 * @return {String}
	 */
	get peerName()
	{
		return this._peerName;
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
	getPeerByName(name)
	{
		return this._peers.get(name);
	}

	/**
	 * Start the procedures to join a remote room.
	 * @param {String} peerName - My mediasoup Peer name.
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise}
	 */
	join(peerName, appData)
	{
		logger.debug('join() [peerName:"%s"]', peerName);

		if (typeof peerName !== 'string')
			return Promise.reject(new TypeError('invalid peerName'));

		if (this._state !== RoomState.new && this._state !== RoomState.closed)
		{
			return Promise.reject(
				new InvalidStateError(`invalid state "${this._state}"`));
		}

		this._peerName = peerName;
		this._state = RoomState.joining;

		let roomSettings;

		return Promise.resolve()
			.then(() =>
			{
				// If Room settings are provided don't query them.
				if (this._settings.roomSettings)
				{
					roomSettings = this._settings.roomSettings;

					return;
				}
				else
				{
					return this._sendRequest('queryRoom', { target: 'room' })
						.then((response) =>
						{
							roomSettings = response;

							logger.debug(
								'join() | got Room settings:%o', roomSettings);
						});
				}
			})
			.then(() =>
			{
				return Device.Handler.getNativeRtpCapabilities();
			})
			.then((nativeRtpCapabilities) =>
			{
				logger.debug(
					'join() | native RTP capabilities:%o', nativeRtpCapabilities);

				// Get extended RTP capabilities.
				this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
					nativeRtpCapabilities, roomSettings.rtpCapabilities);

				logger.debug(
					'join() | extended RTP capabilities:%o', this._extendedRtpCapabilities);

				// Check unsupported codecs.
				const unsupportedRoomCodecs = ortc.getUnsupportedCodecs(
					roomSettings.rtpCapabilities,
					roomSettings.mandatoryCodecPayloadTypes,
					this._extendedRtpCapabilities);

				if (unsupportedRoomCodecs.length > 0)
				{
					logger.error(
						'%s mandatory room codecs not supported:%o',
						unsupportedRoomCodecs.length,
						unsupportedRoomCodecs);

					throw new UnsupportedError(
						'mandatory room codecs not supported', unsupportedRoomCodecs);
				}

				// Check whether we can send audio/video.
				this._canSendByKind.audio =
					ortc.canSend('audio', this._extendedRtpCapabilities);
				this._canSendByKind.video =
					ortc.canSend('video', this._extendedRtpCapabilities);

				// Generate our effective RTP capabilities for receiving media.
				const effectiveLocalRtpCapabilities =
					ortc.getRtpCapabilities(this._extendedRtpCapabilities);

				logger.debug(
					'join() | effective local RTP capabilities for receiving:%o',
					effectiveLocalRtpCapabilities);

				const data =
				{
					target          : 'room',
					peerName        : this._peerName,
					rtpCapabilities : effectiveLocalRtpCapabilities,
					appData         : appData
				};

				return this._sendRequest('join', data)
					.then((response) => response.peers);
			})
			.then((peers) =>
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
		this._sendNotification('leave', { appData });

		// Set closed state after sending the notification (otherwise the
		// notification won't be sent).
		this._state = RoomState.closed;

		this.safeEmit('close', 'local', appData);

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
	 * Invoked via remote notification or via API.
	 *
	 * @param {Any} [appData] - App custom data.
	 */
	remoteClose(appData)
	{
		logger.debug('remoteClose()');

		if (this.closed)
			return;

		this._state = RoomState.closed;

		this.safeEmit('close', 'remote', appData);

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
				.then(callback)
				.catch(errback);
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
	 * @param {Object} [options]
	 * @param {Object} [options.simulcast]
	 * @param {Any} [appData] - App custom data.
	 *
	 * @return {Producer}
	 *
	 * @throws {InvalidStateError} if not joined.
	 * @throws {TypeError} if wrong arguments.
	 * @throws {Error} if cannot send the given kind.
	 */
	createProducer(track, options, appData)
	{
		logger.debug('createProducer() [track:%o, options:%o]', track, options);

		if (!this.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (!(track instanceof MediaStreamTrack))
			throw new TypeError('track is not a MediaStreamTrack');
		else if (!this._canSendByKind[track.kind])
			throw new Error(`cannot send ${track.kind}`);
		else if (track.readyState === 'ended')
			throw new Error('track.readyState is "ended"');

		options = options || {};

		// Create a new Producer.
		const producer = new Producer(track, options, appData);

		// Store it.
		this._producers.set(producer.id, producer);

		producer.on('@close', () =>
		{
			this._producers.delete(producer.id);
		});

		return producer;
	}

	/**
	 * Produce a ICE restart in all the Transports.
	 */
	restartIce()
	{
		if (!this.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);

		for (const transport of this._transports.values())
		{
			transport.restartIce();
		}
	}

	/**
	 * Provide the local Room with a notification generated by mediasoup server.
	 *
	 * @param {Object} notification
	 */
	receiveNotification(notification)
	{
		if (this.closed)
			return Promise.reject(new InvalidStateError('Room closed'));
		else if (typeof notification !== 'object')
			return Promise.reject(new TypeError('wrong notification Object'));
		else if (notification.notification !== true)
			return Promise.reject(new TypeError('not a notification'));
		else if (typeof notification.method !== 'string')
			return Promise.reject(new TypeError('wrong/missing notification method'));

		const { method } = notification;

		logger.debug(
			'receiveNotification() [method:%s, notification:%o]',
			method, notification);

		return Promise.resolve()
			.then(() =>
			{
				switch (method)
				{
					case 'closed':
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
							throw new Error(`Transport not found [id:"${id}"]`);

						transport.remoteClose(appData);

						break;
					}

					case 'newPeer':
					{
						const { name } = notification;

						if (this._peers.has(name))
							throw new Error(`Peer already exists [name:"${name}"]`);

						const peerData = notification;

						this._handlePeerData(peerData);

						break;
					}

					case 'peerClosed':
					{
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
						const { id, peerName, appData } = notification;
						const peer = this._peers.get(peerName);

						if (!peer)
							throw new Error(`no Peer found [name:"${peerName}"]`);

						const consumer = peer.getConsumerById(id);

						if (!consumer)
							throw new Error(`Consumer not found [id:${id}]`);

						consumer.remoteResume(appData);

						break;
					}

					case 'consumerPreferredProfileSet':
					{
						const { id, peerName, profile } = notification;
						const peer = this._peers.get(peerName);

						if (!peer)
							throw new Error(`no Peer found [name:"${peerName}"]`);

						const consumer = peer.getConsumerById(id);

						if (!consumer)
							throw new Error(`Consumer not found [id:${id}]`);

						consumer.remoteSetPreferredProfile(profile);

						break;
					}

					case 'consumerEffectiveProfileChanged':
					{
						const { id, peerName, profile } = notification;
						const peer = this._peers.get(peerName);

						if (!peer)
							throw new Error(`no Peer found [name:"${peerName}"]`);

						const consumer = peer.getConsumerById(id);

						if (!consumer)
							throw new Error(`Consumer not found [id:${id}]`);

						consumer.remoteEffectiveProfileChanged(profile);

						break;
					}

					default:
						throw new Error(`unknown notification method "${method}"`);
				}
			})
			.catch((error) =>
			{
				logger.error(
					'receiveNotification() failed [notification:%o]: %s', notification, error);
			});
	}

	_sendRequest(method, data)
	{
		const request = Object.assign({ method, target: 'peer' }, data);

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

			const errback = (error) =>
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

				// Make sure message is an Error.
				if (!(error instanceof Error))
					error = new Error(String(error));

				logger.error('request failed [method:%s]:%o', method, error);

				reject(error);
			};

			this.safeEmit('request', request, callback, errback);
		});
	}

	_sendNotification(method, data)
	{
		// Ignore if closed.
		if (this.closed)
			return;

		const notification =
			Object.assign({ method, target: 'peer', notification: true }, data);

		logger.debug(
			'_sendNotification() [method:%s, notification:%o]', method, notification);

		this.safeEmit('notify', notification);
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
		const consumer = new Consumer(id, kind, rtpParameters, peer, appData);
		const supported =
			ortc.canReceive(consumer.rtpParameters, this._extendedRtpCapabilities);

		if (supported)
			consumer.setSupported(true);

		if (paused)
			consumer.remotePause();

		peer.addConsumer(consumer);
	}
}
