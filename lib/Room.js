'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import { InvalidStateError, TimeoutError } from './errors';
import * as ortc from './ortc';
import Device from './Device';
import Transport from './Transport';
import Sender from './Sender';

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
export default class Room extends SafeEventEmitter
{
	/**
	 * Room class.
	 *
	 * @param {Object} [options]
	 * @param {Number} [options.requestTimeout] - Timeout for sent requests
	 * (in milliseconds). Defaults to 10000 (10 seconds).
	 * @param {Object} [options.transportOptions] - Transport options for mediasoup.
	 * @param {Array<RTCIceServer>} [options.turnServers] - Array of TURN servers.
	 */
	constructor(options)
	{
		logger.debug('constructor() [options:%o]');

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

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = null;

		this._settings =
		{
			requestTimeout   : options.requestTimeout || 10000,
			transportOptions : options.transportOptions || {},
			turnServers      : options.turnServers || []
		};
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
	 * Whether the Room is joined.
	 *
	 * @return {Boolean}
	 */
	get joined()
	{
		return this._state === RoomState.joined;
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
	 * Close the Room.
	 */
	close()
	{
		logger.debug('close()');

		if (this.closed)
			return;

		// Set flag.
		this._state === RoomState.closed;

		// Close all the Transports.
		for (let transport of this._transports.values())
		{
			transport.close();
		}
		this._transports.clear();

		// Close all the Senders (just in case any of them was not yet handled by
		// a Transport).
		for (let sender of this._senders.values())
		{
			sender.close();
		}
		this._senders.clear();

		// Emit event.
		this.safeEmit('close');
	}

	/**
	 * Start the procedures to join a remote room.
	 *
	 * @return {Promise}
	 */
	join()
	{
		logger.debug('join()');

		if (this._state !== RoomState.new)
		{
			return Promise.reject(
				new InvalidStateError(`invalid state "${this._state}"`));
		}

		let localRtpCapabilities;

		this._state = RoomState.joining;

		global.Device = Device;

		return Device.Handler.getLocalRtpCapabilities()
			.then((rtpCapabilities) =>
			{
				localRtpCapabilities = rtpCapabilities;

				return this._sendRequest('join');
			})
			.then((response) =>
			{
				const remoteRtpCapabilities = response.rtpCapabilities;

				// Get extended RTP capabilities.
				this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
					localRtpCapabilities, remoteRtpCapabilities);

				// TODO: Handle response.peers.

				this._state = RoomState.joined;
			})
			.catch((error) =>
			{
				this._state = RoomState.new;

				throw error;
			});
	}

	/**
	 * Creates a Transport.
	 *
	 * @param {String} direction - Must be 'send' or 'recv'.
	 * @return {Transport}
	 */
	createTransport(direction)
	{
		logger.debug('createTransport() [direction:%s]', direction);

		if (this._state !== RoomState.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (direction !== 'send' && direction !== 'recv')
			throw new TypeError(`invalid direction "${direction}"`);

		// Create a new Transport.
		const transport =
			new Transport(direction, this._extendedRtpCapabilities, this._settings);

		// Store it.
		this._transports.set(transport.id, transport);

		transport.on('request', (method, data, callback, errback) =>
		{
			this._sendRequest(method, data)
				.then(callback || function() {})
				.catch(errback || function() {});
		});

		transport.on('notification', (method, data) =>
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
	 * @return {Sender}
	 */
	createSender(track)
	{
		logger.debug('createSender() [track:%o]', track);

		if (this._state !== RoomState.joined)
			throw new InvalidStateError(`invalid state "${this._state}"`);
		else if (!(track instanceof MediaStreamTrack))
			throw new TypeError('track is not a MediaStreamTrack');
		else if (track.readyState === 'ended')
			throw new Error('track.readyState is "ended"');

		// Clone the track.
		track = track.clone();

		// Create a new Sender.
		const sender = new Sender(track);

		// Store it.
		this._senders.set(sender.id, sender);

		sender.on('close', () =>
		{
			this._senders.delete(sender.id);
		});

		return sender;
	}

	_sendRequest(method, data)
	{
		const request = Object.assign({ method }, data);

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

				if (this.closed)
				{
					logger.error(
						'"request" event failed [method:%s]: Room closed', method);

					reject(new Error('Room closed'));
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

				if (this.closed)
				{
					logger.error(
						'"request" event failed [method:%s]: Room closed', method);

					reject(new Error('Room closed'));
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
		const notification = Object.assign({ method }, data);

		logger.debug(
			'_sendNotification() [method:%s, notification:%o]', method, notification);

		this.safeEmit('notification', notification);
	}
}
