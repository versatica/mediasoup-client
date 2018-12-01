import Logger from './Logger';
import { UnsupportedError, InvalidStateError } from './errors';
import detectDevice from './detectDevice';
import * as ortc from './ortc';
import Transport from './Transport';

const logger = new Logger('Device');

export default class Device
{
	/**
	 * Create a new device to connect to mediasoup server.
	 *
	 * @param {Class} [Handler] - An optional RTC handler class for unsupported or
	 *   custom devices. Don't set it when in a browser.
	 *
	 * @throws {UnsupportedError} if device is not supported.
	 */
	constructor({ Handler } = {})
	{
		logger.debug('constructor()');

		// RTC handler class.
		this._Handler = Handler === undefined ? detectDevice() : Handler;

		if (!this._Handler)
			throw new UnsupportedError('device not supported');

		logger.debug('constructor() [Handler:%s]', this._Handler.name);

		// Extended RTP capabilities.
		// @type {Object}
		this._extendedRtpCapabilities = null;

		// Local RTP capabilities for receiving media.
		// @type {RTCRtpCapabilities}
		this._recvRtpCapabilities = null;

		// Whether we can send audio/video based on computed extended RTP
		// capabilities.
		// @type {Object}
		this._canSendByKind =
		{
			audio : false,
			video : false
		};

		// Loaded flag.
		// @type {Boolean}
		this._loaded = false;
	}

	/**
	 * Initialize the device.
	 *
	 * @param {RTCRtpCapabilities} roomRtpCapabilities - Room RTP capabilities.
	 *
	 * @return {Promise} Resolves once loaded.
	 */
	load({ roomRtpCapabilities } = {})
	{
		logger.debug('load() [roomRtpCapabilities:%o]', roomRtpCapabilities);

		if (!roomRtpCapabilities)
			return Promise.reject(new TypeError('missing roomRtpCapabilities'));
		else if (this._loaded)
			return Promise.reject(new InvalidStateError('already loaded'));

		return Promise.resolve()
			.then(() =>
			{
				return this._Handler.getNativeRtpCapabilities();
			})
			.then((nativeRtpCapabilities) =>
			{
				logger.debug(
					'load() | got native RTP capabilities:%o', nativeRtpCapabilities);

				// Get extended RTP capabilities.
				this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
					nativeRtpCapabilities, roomRtpCapabilities);

				logger.debug(
					'load() | got extended RTP capabilities:%o', this._extendedRtpCapabilities);

				// Check whether we can send audio/video.
				this._canSendByKind.audio =
					ortc.canSend('audio', this._extendedRtpCapabilities);
				this._canSendByKind.video =
					ortc.canSend('video', this._extendedRtpCapabilities);

				// Generate our receiving RTP capabilities for receiving media.
				this._recvRtpCapabilities =
					ortc.getRecvRtpCapabilities(this._extendedRtpCapabilities);

				logger.debug(
					'load() | got receiving RTP capabilities for receiving:%o',
					this._recvRtpCapabilities);

				logger.debug('load() succeeded');

				this._loaded = true;
			})
			.catch((error) =>
			{
				logger.error('load() failed:%o', error);

				this._loaded = false;

				throw error;
			});
	}

	/**
	 * Whether we can send audio/video.
	 *
	 * @param {String} kind - 'audio' or 'video'.
	 *
	 * @return {Boolean}
	 *
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	canSend(kind)
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');
		else if (kind !== 'audio' && kind !== 'video')
			throw new TypeError(`invalid kind "${kind}"`);

		return this._canSendByKind[kind];
	}

	/**
	 * Whether we can receive a producer.
	 *
	 * @param {RTCRtpParameters} consumableRtpParameters
	 *
	 * @return {Boolean}
	 *
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	canReceive(consumableRtpParameters)
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');

		return ortc.canReceive(
			consumableRtpParameters, this._effectiveRtpCapabilities);
	}

	/**
	 * Creates a Transport.
	 *
	 * @param {Object} remoteTransportData - Server-side transport data.
	 * @param {String} direction - Must be 'send' or 'recv'.
	 * @param {Array<RTCIceServer>} [turnServers] - Array of TURN servers.
	 * @param {RTCIceTransportPolicy} [iceTransportPolicy] - ICE transport
	 *   policy.
	 *
	 * @return {Transport}
	 *
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	createTransport(
		{
			remoteTransportData,
			direction,
			turnServers,
			iceTransportPolicy
		} = {}
	)
	{
		logger.debug('createTransport()');

		if (!this._loaded)
			throw new InvalidStateError('not loaded');
		else if (typeof remoteTransportData !== 'object')
			throw new TypeError('missing remoteTransportData');
		else if (direction !== 'send' && direction !== 'recv')
			throw new TypeError(`invalid direction "${direction}"`);

		// Create a new Transport.
		const transport = new Transport(
			{
				remoteTransportData,
				direction,
				turnServers,
				iceTransportPolicy,
				Handler                 : this._Handler,
				extendedRtpCapabilities : this._extendedRtpCapabilities,
				recvRtpCapabilities     : this._recvRtpCapabilities,
				canSendByKind           : this._canSendByKind
			});

		return transport;
	}
}
