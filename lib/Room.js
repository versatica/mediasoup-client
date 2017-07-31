'use strict';

import Logger from './Logger';
import SafeEventEmitter from './SafeEventEmitter';
import { InvalidStateError, TimeoutError } from './errors';
import * as ortc from './ortc';
import Device from './Device';
import Transport from './Transport';

const logger = new Logger('Room');

const REQUEST_TIMEOUT = 10000; // 10 seconds.

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
	constructor()
	{
		logger.debug('constructor()');

		super();

		if (!Device.isSupported())
			throw new Error('current browser/device not supported');

		// Room state.
		// @type {Boolean}
		this._state = RoomState.new;

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = null;

		// Map of Transports indexed by id
		// @type {map<Number, Transport>}
		this._transports = new Map();

		// Map of Senders indexed by id
		// @type {map<Number, Sender>}
		this._senders = new Map();
	}

	/**
	 * Whether the room is closed.
	 *
	 * @return {Boolean}
	 */
	get closed()
	{
		return this._state === RoomState.closed;
	}

	/**
	 * Whether the room is joined.
	 *
	 * @return {Boolean}
	 */
	get joined()
	{
		return this._state === RoomState.joined;
	}

	/**
	 * The list of transports.
	 *
	 * @return {Array<Transport>}
	 */
	get transports()
	{
		return Array.from(this._transports.values());
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

		return Device.getLocalRtpCapabilities()
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
		const transport = new Transport(direction, this._extendedRtpCapabilities);

		// Store it.
		this._transports.set(transport.id, transport);

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
					'"sendrequest" event failed [method:%s]: timeout', method);

				done = true;
				reject(new TimeoutError('timeout'));
			}, REQUEST_TIMEOUT);

			// TODO: We could also handle room 'close' event here.

			const callback = (response) =>
			{
				if (done)
					return;

				done = true;

				if (this._closed)
				{
					logger.error(
						'"sendrequest" event failed [method:%s]: Room closed', method);

					reject(new Error('Room closed'));
					return;
				}

				logger.debug(
					'"sendrequest" event succeeded [method:%s, response:%o]', method, response);

				clearTimeout(timer);
				resolve(response);
			};

			const errback = (message) =>
			{
				if (done)
					return;

				done = true;

				if (this._closed)
				{
					logger.error(
						'"sendrequest" event failed [method:%s]: Room closed', method);

					reject(new Error('Room closed'));
					return;
				}

				logger.error(
					'"sendrequest" event failed [method:%s]: %s', method, message);

				clearTimeout(timer);
				reject(new Error(message));
			};

			this.safeEmit('sendrequest', request, callback, errback);
		});
	}

	_execAddLocalTrack(track)
	{
		logger.debug('_execAddLocalTrack()');

		if (!this._joined)
			return Promise.reject(new InvalidStateError('not joined'));
		else if (!(track instanceof MediaStreamTrack))
			return Promise.reject(new TypeError('track is not a MediaStreamTrack'));
		else if (track.readyState === 'ended')
			return Promise.reject(new Error('track.readyState is "ended"'));

		// Don't allow duplicated tracks.
		for (let sender of this._senders.values())
		{
			if (sender.originalTrackId === track.id)
				return Promise.reject(new Error('track already handled'));
		}

		const originalTrackId = track.id;

		// Clone the track.
		track = track.clone();

		// Call the handler.
		return this._handler.addLocalTrack(track)
			.then((encodings) =>
			{
				// If closed, ensure the track is stopped.
				if (this._closed)
				{
					try { track.stop(); } catch (error) {}
					return;
				}

				// Create a new Sender.
				const sender = new Sender(track, originalTrackId);

				// Store it in the map.
				this._senders.set(sender.id, sender);

				// Handle the new Sender.
				this._handleSender(sender);

				// TODO: Room sholuld have a fixed this._rtpSendRtpParameters
				// to get the codecs, etc (different for audio and video).
				const rtpParameters =
				{
					muxId            : null, // TODO: provided by handler.addLocalTrack?
					codecs           : [],
					headerExtensions : [],
					encodings        : encodings,
					rtcp             : {}
				};

				// TODO: Return promise so this depends on proper server response?
				// Request the server to create a Receiver for this Sender.
				this._sendRequest('createReceiver', { rtpParameters })
					.catch((error) =>
					{
						sender.close(error);
					});

				// Resolve with the Sender.
				return sender;
			})
			.catch((error) =>
			{
				// Stop the track.
				try { track.stop(); } catch (error) {}

				throw error;
			});
	}

	_execRemoveLocalTrack(sender)
	{
		logger.debug('_execRemoveLocalTrack()');

		const track = sender.track;

		// Remove the sender from the map.
		this._senders.delete(sender.id);

		// TODO: Send Request

		// Call the handler.
		return this._handler.removeLocalTrack(track);
	}
}
