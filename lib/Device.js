const Logger = require('./Logger');
const { UnsupportedError, InvalidStateError } = require('./errors');
const detectDevice = require('./detectDevice');
const ortc = require('./ortc');
const Transport = require('./Transport');

const logger = new Logger('Device');

class Device
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

		// Loaded flag.
		// @type {Boolean}
		this._loaded = false;

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
	}

	/**
	 * The RTC handler class name ('Chrome70', 'Firefox65', etc).
	 *
	 * @return {String}
	 */
	get handlerName()
	{
		return this._Handler.name;
	}

	/**
	 * Whether the device is loaded.
	 *
	 * @return {Boolean}
	 */
	get loaded()
	{
		return this._loaded;
	}

	/**
	 * RTP capabilities of the device for receiving media.
	 *
	 * @returns {RTCRtpCapabilities}
	 * @throws {InvalidStateError} if not loaded.
	 */
	get rtpCapabilities()
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');

		return this._recvRtpCapabilities;
	}

	/**
	 * Initialize the device.
	 *
	 * @param {RTCRtpCapabilities} roomRtpCapabilities - Room RTP capabilities.
	 *
	 * @promise
	 * @reject {TypeError} if missing/wrong arguments.
	 * @reject {InvalidStateError} if not loaded.
	 */
	load({ roomRtpCapabilities } = {})
	{
		logger.debug('load() [roomRtpCapabilities:%o]', roomRtpCapabilities);

		if (this._loaded)
			return Promise.reject(new InvalidStateError('already loaded'));
		else if (!roomRtpCapabilities)
			return Promise.reject(new TypeError('missing roomRtpCapabilities'));

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

				throw error;
			});
	}

	/**
	 * Whether we can send audio/video.
	 *
	 * @param {String} kind - 'audio' or 'video'.
	 *
	 * @return {Boolean}
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
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	canReceive(consumableRtpParameters)
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');

		return ortc.canReceive(
			consumableRtpParameters, this._extendedRtpCapabilities);
	}

	/**
	 * Creates a Transport.
	 *
	 * @param {Object} transportRemoteParameters - Server-side transport parameters.
	 * @param {String} direction - Must be 'send' or 'recv'.
	 * @param {Array<RTCIceServer>} [iceServers] - Array of ICE servers.
	 * @param {RTCIceTransportPolicy} [iceTransportPolicy] - ICE transport
	 *   policy.
	 * @param {Object} [proprietaryConstraints] - RTCPeerConnection proprietary constraints.
	 * @param {Any} [appData] - Custom app data.
	 *
	 * @return {Transport}
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	createTransport(
		{
			transportRemoteParameters,
			direction,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			appData
		} = {}
	)
	{
		logger.debug('createTransport()');

		if (!this._loaded)
			throw new InvalidStateError('not loaded');
		else if (typeof transportRemoteParameters !== 'object')
			throw new TypeError('missing transportRemoteParameters');
		else if (typeof transportRemoteParameters.id !== 'string')
			throw new TypeError('missing transportRemoteParameters.id');
		else if (direction !== 'send' && direction !== 'recv')
			throw new TypeError(`invalid direction "${direction}"`);

		// Create a new Transport.
		const transport = new Transport(
			{
				transportRemoteParameters,
				direction,
				iceServers,
				iceTransportPolicy,
				proprietaryConstraints,
				appData,
				Handler                 : this._Handler,
				extendedRtpCapabilities : this._extendedRtpCapabilities,
				recvRtpCapabilities     : this._recvRtpCapabilities,
				canSendByKind           : this._canSendByKind
			});

		return transport;
	}
}

module.exports = Device;
