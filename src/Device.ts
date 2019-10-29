/* global RTCRtpTransceiver */

import * as bowser from 'bowser';
import Logger from './Logger';
import { UnsupportedError, InvalidStateError } from './errors';
import * as ortc from './ortc';
import Transport, { TransportOptions, CanProduceByKind } from './Transport';
import Chrome74 from './handlers/Chrome74';
import Chrome70 from './handlers/Chrome70';
import Chrome67 from './handlers/Chrome67';
import Chrome55 from './handlers/Chrome55';
import Firefox60 from './handlers/Firefox60';
import Safari12 from './handlers/Safari12';
import Safari11 from './handlers/Safari11';
import Edge11 from './handlers/Edge11';
import ReactNative from './handlers/ReactNative';
import { RtpCapabilities } from './RtpParameters';
import { SctpCapabilities } from './SctpParameters';

const logger = new Logger('Device');

interface InternalTransportOptions extends TransportOptions
{
	direction: 'send' | 'recv';
}

export function detectDevice(): any | undefined
{
	// React-Native.
	// NOTE: react-native-webrtc >= 1.75.0 is required.
	if (typeof navigator === 'object' && navigator.product === 'ReactNative')
	{
		if (typeof RTCPeerConnection === 'undefined')
		{
			logger.warn('detectDevice() | unsupported ReactNative without RTCPeerConnection');

			return;
		}

		return ReactNative;
	}
	// Browser.
	else if (typeof navigator === 'object' && typeof navigator.userAgent === 'string')
	{
		const ua = navigator.userAgent;
		const browser = bowser.getParser(ua);
		const engine = browser.getEngine();

		// Chrome and Chromium.
		if (browser.satisfies({ chrome: '>=74', chromium: '>=74' }))
		{
			return Chrome74;
		}
		else if (browser.satisfies({ chrome: '>=70', chromium: '>=70' }))
		{
			return Chrome70;
		}
		else if (browser.satisfies({ chrome: '>=67', chromium: '>=67' }))
		{
			return Chrome67;
		}
		else if (browser.satisfies({ chrome: '>=55', chromium: '>=55' }))
		{
			return Chrome55;
		}
		// Firefox.
		else if (browser.satisfies({ firefox: '>=60' }))
		{
			return Firefox60;
		}
		// Safari with Unified-Plan support.
		else if (
			browser.satisfies({ safari: '>=12.1' }) &&
			typeof RTCRtpTransceiver !== 'undefined' &&
			RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
		)
		{
			return Safari12;
		}
		// Safari with Plab-B support.
		else if (browser.satisfies({ safari: '>=11' }))
		{
			return Safari11;
		}
		// Old Edge with ORTC support.
		else if (
			browser.satisfies({ 'microsoft edge': '>=11' }) &&
			browser.satisfies({ 'microsoft edge': '<=18' })
		)
		{
			return Edge11;
		}
		// Best effort for Chromium based browsers.
		else if (engine.name && engine.name.toLowerCase() === 'blink')
		{
			logger.debug('detectDevice() | best effort Chromium based browser detection');

			const match = ua.match(/(?:(?:Chrome|Chromium))[ /](\w+)/i);

			if (match)
			{
				const version = Number(match[1]);

				if (version >= 74)
					return Chrome74;
				else if (version >= 70)
					return Chrome70;
				else if (version >= 67)
					return Chrome67;
				else
					return Chrome55;
			}
			else
			{
				return Chrome74;
			}
		}
		// Unsupported browser.
		else
		{
			logger.warn(
				'detectDevice() | browser not supported [name:%s, version:%s]',
				browser.getBrowserName(), browser.getBrowserVersion());

			return;
		}
	}
	// Unknown device.
	else
	{
		logger.warn('detectDevice() | unknown device');

		return;
	}
}

export default class Device
{
	// RTC handler class.
	private readonly _Handler: any;

	// Loaded flag.
	private _loaded = false;

	// Extended RTP capabilities.
	private _extendedRtpCapabilities: any;

	// Local RTP capabilities for receiving media.
	private _recvRtpCapabilities?: RtpCapabilities;

	// Whether we can produce audio/video based on computed extended RTP
	// capabilities.
	private readonly _canProduceByKind: CanProduceByKind;

	// Local SCTP capabilities.
	private _sctpCapabilities: SctpCapabilities;

	/**
	 * Create a new Device to connect to mediasoup server.
	 *
	 * @param {Class|String} [Handler] - An optional RTC handler class for unsupported or
	 *   custom devices (not needed when running in a browser). If a String, it will
	 *   force usage of the given built-in handler.
	 *
	 * @throws {UnsupportedError} if device is not supported.
	 */
	constructor({ Handler }: { Handler?: string | any } = {})
	{
		if (typeof Handler === 'string')
		{
			switch (Handler)
			{
				case 'Chrome74':
					Handler = Chrome74;
					break;
				case 'Chrome70':
					Handler = Chrome70;
					break;
				case 'Chrome67':
					Handler = Chrome67;
					break;
				case 'Chrome55':
					Handler = Chrome55;
					break;
				case 'Firefox60':
					Handler = Firefox60;
					break;
				case 'Safari12':
					Handler = Safari12;
					break;
				case 'Safari11':
					Handler = Safari11;
					break;
				case 'Edge11':
					Handler = Edge11;
					break;
				case 'ReactNative':
					Handler = ReactNative;
					break;
				default:
					throw new TypeError(`unknown Handler "${Handler}"`);
			}
		}

		// RTC handler class.
		this._Handler = Handler || detectDevice();

		if (!this._Handler)
			throw new UnsupportedError('device not supported');

		logger.debug('constructor() [Handler:%s]', this._Handler.name);

		this._extendedRtpCapabilities = null;
		this._recvRtpCapabilities = undefined;

		this._canProduceByKind =
		{
			audio : false,
			video : false
		};

		this._sctpCapabilities = null;
	}

	/**
	 * The RTC handler class name ('Chrome70', 'Firefox65', etc).
	 */
	get handlerName(): string
	{
		return this._Handler.label;
	}

	/**
	 * Whether the Device is loaded.
	 */
	get loaded(): boolean
	{
		return this._loaded;
	}

	/**
	 * RTP capabilities of the Device for receiving media.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 */
	get rtpCapabilities(): RtpCapabilities | undefined
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');

		return this._recvRtpCapabilities;
	}

	/**
	 * SCTP capabilities of the Device.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 */
	get sctpCapabilities(): any
	{
		if (!this._loaded)
			throw new InvalidStateError('not loaded');

		return this._sctpCapabilities;
	}

	/**
	 * Initialize the Device.
	 */
	async load(
		{ routerRtpCapabilities }:
		{ routerRtpCapabilities?: RtpCapabilities } = {}
	): Promise<void>
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
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	canProduce(kind: 'audio' | 'video'): boolean
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
			additionalSettings,
			proprietaryConstraints,
			appData = {}
		}: TransportOptions
	): Transport
	{
		logger.debug('createSendTransport()');

		return this._createTransport(
			{
				direction              : 'send',
				id                     : id,
				iceParameters          : iceParameters,
				iceCandidates          : iceCandidates,
				dtlsParameters         : dtlsParameters,
				sctpParameters         : sctpParameters,
				iceServers             : iceServers,
				iceTransportPolicy     : iceTransportPolicy,
				additionalSettings     : additionalSettings,
				proprietaryConstraints : proprietaryConstraints,
				appData                : appData
			});
	}

	/**
	 * Creates a Transport for receiving media.
	 *
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
			additionalSettings,
			proprietaryConstraints,
			appData = {}
		}: TransportOptions
	): Transport
	{
		logger.debug('createRecvTransport()');

		return this._createTransport(
			{
				direction              : 'recv',
				id                     : id,
				iceParameters          : iceParameters,
				iceCandidates          : iceCandidates,
				dtlsParameters         : dtlsParameters,
				sctpParameters         : sctpParameters,
				iceServers             : iceServers,
				iceTransportPolicy     : iceTransportPolicy,
				additionalSettings     : additionalSettings,
				proprietaryConstraints : proprietaryConstraints,
				appData                : appData
			});
	}

	private _createTransport(
		{
			direction,
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			proprietaryConstraints,
			appData = {}
		}: InternalTransportOptions
	): Transport
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
				additionalSettings,
				proprietaryConstraints,
				appData,
				Handler                 : this._Handler,
				extendedRtpCapabilities : this._extendedRtpCapabilities,
				canProduceByKind        : this._canProduceByKind
			});

		return transport;
	}
}
