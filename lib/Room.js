'use strict';

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import { InvalidStateError, TimeoutError } from './errors';
import * as utils from './utils';
import Device from './Device';
import Transport from './Transport';
import Sender from './Sender';
import Peer from './Peer';
import Receiver from './Receiver';

const logger = new Logger('Room');

const RoomState =
{
	new     : 'new',
	joining : 'joining',
	joined  : 'joined',
	left    : 'left'
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
	 * @param {Number} [options.requestTimeout] - Timeout for sent requests
	 * (in milliseconds). Defaults to 10000 (10 seconds).
	 * @param {Object} [options.transportOptions] - Transport options for mediasoup.
	 * @param {Array<RTCIceServer>} [options.turnServers] - Array of TURN servers.
	 * @emits {function(request: Object, callback: Function, errback: Function)} request
	 * @emits {function(notification: Object)} notify
	 * @emits {function(peer: Peer)} newpeer
	 * @emits {function([appData]: Any)} close
	 */
	constructor(options)
	{
		logger.debug('constructor() [options:%o]', options);

		super();

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		options = options || {};

		// Room state.
		// @type {Boolean}
		this._state = RoomState.new;

		// Map of Transports indexed by id.
		// @type {map<Number, Transport>}
		this._transports = new Map();

		// Map of Senders indexed by id.
		// @type {map<Number, Sender>}
		this._senders = new Map();

		// Map of Peers indexed by name.
		// @type {map<String, Peer>}
		this._peers = new Map();

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = null;

		// Computed settings.
		// @type {Object}
		this._settings =
		{
			requestTimeout   : options.requestTimeout || 10000,
			transportOptions : options.transportOptions || {},
			turnServers      : options.turnServers || []
		};

		// Whether we can send audio/video based on computed extended RTP
		// capabilities.
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
	 * Whether we have left the Room.
	 *
	 * @return {Boolean}
	 */
	get left()
	{
		return this._state === RoomState.left;
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
	 * The list of Senders.
	 *
	 * @return {Array<Sender>}
	 */
	get senders()
	{
		return Array.from(this._senders.values());
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
	 * @param {Any} [appData] - App custom data.
	 * @return {Promise}
	 */
	join(appData)
	{
		logger.debug('join()');

		if (this._state !== RoomState.new)
		{
			return Promise.reject(
				new InvalidStateError(`invalid state "${this._state}"`));
		}

		let localRtpCapabilities;

		this._state = RoomState.joining;

		return Device.Handler.getLocalRtpCapabilities()
			.then((rtpCapabilities) =>
			{
				localRtpCapabilities = rtpCapabilities;

				return this._sendRequest('join', { appData });
			})
			.then((response) =>
			{
				// Get remote RTP capabilities.
				const remoteRtpCapabilities = response.rtpCapabilities;

				// Get extended RTP capabilities.
				this._extendedRtpCapabilities = utils.getExtendedRtpCapabilities(
					localRtpCapabilities, remoteRtpCapabilities);

				// Check whether we can send audio/video.
				this._canSendByKind.audio = this._extendedRtpCapabilities.codecs.
					some((codec) => codec.kind === 'audio');
				this._canSendByKind.video = this._extendedRtpCapabilities.codecs.
					some((codec) => codec.kind === 'video');

				// Handle Peers already existing in the room.
				const { peers } = response;

				for (let peerData of peers)
				{
					try
					{
						this._handleNewPeerNotification(peerData);
					}
					catch (error)
					{
						logger.error('join() | error handling Peer:%o', error);
					}
				}

				this._state = RoomState.joined;

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

		if (this.left)
			return;

		// Send a notification.
		this._sendNotification('leave', { appData });

		// Close the Room.
		this.close(appData);
	}

	receiveNotification(notification)
	{
		try
		{
			if (this.left)
				throw new InvalidStateError('Room left');
			else if (typeof notification !== 'object')
				throw new TypeError('wrong notification Object');
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

					this.close(appData);

					break;
				}

				case 'transportClosed':
				{
					const { id, appData } = notification;
					const transport = this._transports.get(id);

					if (!transport)
						throw new Error(`Peer already exists [name:"${name}"]`);

					transport.close(appData);

					break;
				}

				case 'newPeer':
				{
					const { name } = notification;

					if (this._peers.has(name))
						throw new Error(`Peer already exists [name:"${name}"]`);

					const peerData = notification;

					this._handleNewPeerNotification(peerData);

					break;
				}

				case 'peerLeft':
				{
					const peerName = notification.name;
					const { appData } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					peer.leave(appData);

					break;
				}

				case 'newSender':
				{
					const { peerName } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					const senderData = notification;

					this._handleNewReceiverNotification(senderData, peer);

					break;
				}

				case 'senderClosed':
				{
					const { id, peerName, appData } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					const receiver = peer.getReceiverById(id);

					if (!receiver)
						throw new Error(`Receiver not found [id:${id}]`);

					receiver.close(appData);

					break;
				}

				case 'senderPaused':
				{
					const { id, peerName, appData } = notification;
					const peer = this._peers.get(peerName);

					if (!peer)
						throw new Error(`no Peer found [name:"${peerName}"]`);

					const receiver = peer.getReceiverById(id);

					if (!receiver)
						throw new Error(`Receiver not found [id:${id}]`);

					receiver.setPaused(true, appData);

					break;
				}

				case 'senderResumed':
				{
					const { id, peerName, appData } = notification;
					const peer = this._peers.get(peerName);

					const receiver = peer.getReceiverById(id);

					if (!receiver)
						throw new Error(`Receiver not found [id:${id}]`);

					receiver.setPaused(false, appData);

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

	/**
	 * Whether we can send audio/video.
	 *
	 * @param {String} kind - 'audio' or 'video'.
	 * @return {Boolean}
	 */
	canSend(kind)
	{
		if (this._state !== RoomState.joined)
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
	 * @return {Transport}
	 */
	createTransport(direction, appData)
	{
		logger.debug('createTransport() [direction:%s]', direction);

		if (this._state !== RoomState.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (direction !== 'send' && direction !== 'recv')
			throw new TypeError(`invalid direction "${direction}"`);

		// Create a new Transport.
		const transport = new Transport(
			direction, this._extendedRtpCapabilities, this._settings, appData);

		// Store it.
		this._transports.set(transport.id, transport);

		transport.on('request', (method, data, callback, errback) =>
		{
			this._sendRequest(method, data)
				.then(callback || function() {})
				.catch(errback || function() {});
		});

		transport.on('notify', (method, data) =>
		{
			this._sendNotification(method, data);
		});

		transport.on('close', () =>
		{
			this._transports.delete(transport.id);
		});

		return transport;
	}

	/**
	 * Creates a Sender.
	 *
	 * @param {MediaStreamTrack} track
	 * @param {Any} [appData] - App custom data.
	 * @return {Sender}
	 */
	createSender(track, appData)
	{
		logger.debug('createSender() [track:%o]', track);

		if (this._state !== RoomState.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (!(track instanceof MediaStreamTrack))
			throw new TypeError('track is not a MediaStreamTrack');
		else if (!this._canSendByKind[track.kind])
			throw new Error(`cannot send ${track.kind}`);
		else if (track.readyState === 'ended')
			throw new Error('track.readyState is "ended"');

		const originalTrack = track;

		// Clone the track.
		track = originalTrack.clone();

		// Create a new Sender.
		const sender = new Sender(track, originalTrack, appData);

		// Store it.
		this._senders.set(sender.id, sender);

		sender.on('close', () =>
		{
			this._senders.delete(sender.id);
		});

		return sender;
	}

	/**
	 * Notifies that the remote Room has been closed.
	 *
	 * @private
	 * @param {Any} [appData] - App custom data.
	 */
	close(appData)
	{
		logger.debug('close()');

		if (this.left)
			return;

		// Set flag.
		this._state = RoomState.left;

		this.safeEmit('close', appData);

		// Close all the Senders.
		for (let sender of this._senders.values())
		{
			sender.close();
		}
		this._senders.clear();

		// Close all the Peers.
		for (let peer of this._peers.values())
		{
			peer.leave();
		}
		this._peers.clear();

		// Close all the Transports.
		for (let transport of this._transports.values())
		{
			transport.close();
		}
		this._transports.clear();
	}

	_sendRequest(method, data)
	{
		const request = Object.assign({ method }, data);

		// Should never happen.
		// Ignore if left.
		if (this.left)
		{
			logger.warn(
				'_sendRequest() | ignoring request (Room left) [method:%s, request:%o]',
				method, request);

			return Promise.reject(new InvalidStateError('Room left'));
		}

		logger.debug('_sendRequest() [method:%s, request:%o]', method, request);

		return new Promise((resolve, reject) =>
		{
			let done = false;

			const timer = setTimeout(() =>
			{
				logger.error(
					'"request" event failed [method:%s]: timeout', method);

				done = true;
				reject(new TimeoutError('timeout'));
			}, this._settings.requestTimeout);

			// TODO: We could also handle room 'close' event here.

			const callback = (response) =>
			{
				if (done)
					return;

				done = true;
				clearTimeout(timer);

				if (this.left)
				{
					logger.error(
						'"request" event failed [method:%s]: Room left', method);

					reject(new Error('Room left'));
					return;
				}

				logger.debug(
					'"request" event succeeded [method:%s, response:%o]', method, response);

				resolve(response);
			};

			const errback = (message) =>
			{
				if (done)
					return;

				done = true;
				clearTimeout(timer);

				if (this.left)
				{
					logger.error(
						'"request" event failed [method:%s]: Room left', method);

					reject(new Error('Room left'));
					return;
				}

				// Make sure message is a String.
				message = String(message);

				logger.error(
					'"request" event failed [method:%s]: %s', method, message);

				reject(new Error(message));
			};

			this.safeEmit('request', request, callback, errback);
		});
	}

	_sendNotification(method, data)
	{
		// Ignore if left.
		if (this.left)
			return;

		const notification = Object.assign({ method, notification: true }, data);

		logger.debug(
			'_sendNotification() [method:%s, notification:%o]', method, notification);

		this.safeEmit('notify', notification);
	}

	_handleNewPeerNotification(peerData)
	{
		const { name, senders, appData } = peerData;
		const peer = new Peer(name, appData);

		// Store it.
		this._peers.set(peer.name, peer);

		peer.on('leave', () =>
		{
			this._peers.delete(peer.name);
		});

		// Add senders.
		for (let senderData of senders)
		{
			try
			{
				this._handleNewReceiverNotification(senderData, peer);
			}
			catch (error)
			{
				logger.error('error handling existing remote sender in Peer:%o', error);
			}
		}

		// If already joined emit event.
		if (this.joined)
			this.safeEmit('newpeer', peer);
	}

	_handleNewReceiverNotification(senderData, peer)
	{
		const { id, kind, rtpParameters, paused, appData } = senderData;
		const receiver = new Receiver(id, kind, rtpParameters, appData);
		const supported =
			utils.canReceive(receiver.rtpParameters, this._extendedRtpCapabilities);

		if (supported)
		{
			receiver.setSupported(true);

			const rtpSettings =
				utils.getReceivingSettings(
					receiver.rtpParameters, this._extendedRtpCapabilities);

			receiver.setRtpSettings(rtpSettings);
		}

		if (paused)
			receiver.setPaused(true);

		peer.addReceiver(receiver);
	}
}
