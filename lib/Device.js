const Logger = require('./Logger');
const { UnsupportedError, InvalidStateError } = require('./errors');
const detectDevice = require('./detectDevice');
const ortc = require('./ortc');
const Transport = require('./Transport');

const logger = new Logger('Device');

class Device
{
	/**
	 * Create a new Device to connect to mediasoup server.
	 *
	 * @param {Class} [Handler] - An optional RTC handler class for unsupported or
	 *   custom devices. Don't set it when in a browser.
	 *
	 * @throws {UnsupportedError} if device is not supported.
	 */
	constructor({ Handler } = {})
	{
		// RTC handler class.
		this._Handler = Handler || detectDevice();

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

		// Whether we can produce audio/video based on computed extended RTP
		// capabilities.
		// @type {Object}
		this._canProduceByKind =
		{
			audio : false,
			video : false
		};

		// Local SCTP capabilities.
		// @type {Object}
		this._sctpCapabilities = null;
	}

	/**
	 * The RTC handler class name ('Chrome70', 'Firefox65', etc).
	 *
	 * @returns {String}
	 */
	get handlerName()
	{
		return this._Handler.name;
	}

	/**
	 * Whether the Device is loaded.
	 *
	 * @returns {Boolean}
	 */
	get loaded()
	{
		return this._loaded;
	}

	/**
	 * RTP capabilities of the Device for receiving media.
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
	 * SCTP capabilities of the Device.
	 *
	 * @returns {Object}
	 * @throws {InvalidStateError} if not loaded.
	 */
	get sctpCapabilities()
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');

		return this._sctpCapabilities;
	}

	/**
	 * Initialize the Device.
	 *
	 * @param {RTCRtpCapabilities} routerRtpCapabilities - Router RTP capabilities.
	 *
	 * @async
	 * @throws {TypeError} if missing/wrong arguments.
	 * @throws {InvalidStateError} if already loaded.
	 */
	async load({ routerRtpCapabilities } = {})
	{
		logger.debug('load() [routerRtpCapabilities:%o]', routerRtpCapabilities);

		if (this._loaded)
			throw new InvalidStateError('already loaded');
		else if (typeof routerRtpCapabilities !== 'object')
			throw new TypeError('missing routerRtpCapabilities');

		const nativeRtpCapabilities = await this._Handler.getNativeRtpCapabilities();

		logger.debug(
			'load() | got native RTP capabilities:%o', nativeRtpCapabilities);

		// Get extended RTP capabilities.
		this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
			nativeRtpCapabilities, routerRtpCapabilities);

		logger.debug(
			'load() | got extended RTP capabilities:%o', this._extendedRtpCapabilities);

		// Check whether we can produce audio/video.
		this._canProduceByKind.audio =
			ortc.canSend('audio', this._extendedRtpCapabilities);
		this._canProduceByKind.video =
			ortc.canSend('video', this._extendedRtpCapabilities);

		// Generate our receiving RTP capabilities for receiving media.
		this._recvRtpCapabilities =
			ortc.getRecvRtpCapabilities(this._extendedRtpCapabilities);

		logger.debug(
			'load() | got receiving RTP capabilities:%o', this._recvRtpCapabilities);

		this._sctpCapabilities = await this._Handler.getNativeSctpCapabilities();

		logger.debug(
			'load() | got native SCTP capabilities:%o', this._sctpCapabilities);

		logger.debug('load() succeeded');

		this._loaded = true;
	}

	/**
	 * Whether we can produce audio/video.
	 *
	 * @param {String} kind - 'audio' or 'video'.
	 *
	 * @returns {Boolean}
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	canProduce(kind)
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');
		else if (kind !== 'audio' && kind !== 'video')
			throw new TypeError(`invalid kind "${kind}"`);

		return this._canProduceByKind[kind];
	}

	/**
	 * Creates a Transport for sending media.
	 *
	 * @param {String} - Server-side Transport id.
	 * @param {RTCIceParameters} iceParameters - Server-side Transport ICE parameters.
	 * @param {Array<RTCIceCandidate>} [iceCandidates] - Server-side Transport ICE candidates.
	 * @param {RTCDtlsParameters} dtlsParameters - Server-side Transport DTLS parameters.
	 * @param {Object} [sctpParameters] - Server-side SCTP parameters.
	 * @param {Array<RTCIceServer>} [iceServers] - Array of ICE servers.
	 * @param {RTCIceTransportPolicy} [iceTransportPolicy] - ICE transport
	 *   policy.
	 * @param {Object} [proprietaryConstraints] - RTCPeerConnection proprietary constraints.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @returns {Transport}
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	createSendTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			appData = {}
		} = {}
	)
	{
		logger.debug('createSendTransport()');

		return this._createTransport(
			{
				direction : 'send',
				id,
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters,
				iceServers,
				iceTransportPolicy,
				proprietaryConstraints,
				appData
			});
	}

	/**
	 * Creates a Transport for receiving media.
	 *
	 * @param {String} - Server-side Transport id.
	 * @param {RTCIceParameters} iceParameters - Server-side Transport ICE parameters.
	 * @param {Array<RTCIceCandidate>} [iceCandidates] - Server-side Transport ICE candidates.
	 * @param {RTCDtlsParameters} dtlsParameters - Server-side Transport DTLS parameters.
	 * @param {Object} [sctpParameters] - Server-side SCTP parameters.
	 * @param {Array<RTCIceServer>} [iceServers] - Array of ICE servers.
	 * @param {RTCIceTransportPolicy} [iceTransportPolicy] - ICE transport
	 *   policy.
	 * @param {Object} [proprietaryConstraints] - RTCPeerConnection proprietary constraints.
	 * @param {Object} [appData={}] - Custom app data.
	 *
	 * @returns {Transport}
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	createRecvTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			appData = {}
		} = {}
	)
	{
		logger.debug('createRecvTransport()');

		return this._createTransport(
			{
				direction : 'recv',
				id,
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters,
				iceServers,
				iceTransportPolicy,
				proprietaryConstraints,
				appData
			});
	}

	/**
	 * @private
	 */
	_createTransport(
		{
			direction,
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			proprietaryConstraints,
			appData = {}
		}
	)
	{
		logger.debug('createTransport()');

		if (!this._loaded)
			throw new InvalidStateError('not loaded');
		else if (typeof id !== 'string')
			throw new TypeError('missing id');
		else if (typeof iceParameters !== 'object')
			throw new TypeError('missing iceParameters');
		else if (!Array.isArray(iceCandidates))
			throw new TypeError('missing iceCandidates');
		else if (typeof dtlsParameters !== 'object')
			throw new TypeError('missing dtlsParameters');
		else if (sctpParameters && typeof sctpParameters !== 'object')
			throw new TypeError('wrong sctpParameters');
		else if (appData && typeof appData !== 'object')
			throw new TypeError('if given, appData must be an object');

		// Create a new Transport.
		const transport = new Transport(
			{
				direction,
				id,
				iceParameters,
				iceCandidates,
				dtlsParameters,
				sctpParameters,
				iceServers,
				iceTransportPolicy,
				proprietaryConstraints,
				appData,
				Handler                 : this._Handler,
				extendedRtpCapabilities : this._extendedRtpCapabilities,
				canProduceByKind        : this._canProduceByKind
			});

		return transport;
	}
}

module.exports = Device;
