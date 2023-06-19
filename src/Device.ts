import { UAParser } from 'ua-parser-js';
import { Logger } from './Logger';
import { EnhancedEventEmitter } from './EnhancedEventEmitter';
import { UnsupportedError, InvalidStateError } from './errors';
import * as utils from './utils';
import * as ortc from './ortc';
import { Transport, TransportOptions, CanProduceByKind } from './Transport';
import { HandlerFactory, HandlerInterface } from './handlers/HandlerInterface';
import { Chrome111 } from './handlers/Chrome111';
import { Chrome74 } from './handlers/Chrome74';
import { Chrome70 } from './handlers/Chrome70';
import { Chrome67 } from './handlers/Chrome67';
import { Chrome55 } from './handlers/Chrome55';
import { Firefox60 } from './handlers/Firefox60';
import { Safari12 } from './handlers/Safari12';
import { Safari11 } from './handlers/Safari11';
import { Edge11 } from './handlers/Edge11';
import { ReactNativeUnifiedPlan } from './handlers/ReactNativeUnifiedPlan';
import { ReactNative } from './handlers/ReactNative';
import { RtpCapabilities, MediaKind } from './RtpParameters';
import { SctpCapabilities } from './SctpParameters';
import { AppData } from './types';

const logger = new Logger('Device');

export type BuiltinHandlerName =
	| 'Chrome111'
	| 'Chrome74'
	| 'Chrome70'
	| 'Chrome67'
	| 'Chrome55'
	| 'Firefox60'
	| 'Safari12'
	| 'Safari11'
	| 'Edge11'
	| 'ReactNativeUnifiedPlan'
	| 'ReactNative';

export type DeviceOptions =
{
	/**
	 * The name of one of the builtin handlers.
	 */
	handlerName?: BuiltinHandlerName;
	/**
	 * Custom handler factory.
	 */
	handlerFactory?: HandlerFactory;
	/**
	 * DEPRECATED!
	 * The name of one of the builtin handlers.
	 */
	Handler?: string;
};

export function detectDevice(): BuiltinHandlerName | undefined
{
	// React-Native.
	// NOTE: react-native-webrtc >= 1.75.0 is required.
	// NOTE: react-native-webrtc with Unified Plan requires version >= 106.0.0.
	if (typeof navigator === 'object' && navigator.product === 'ReactNative')
	{
		logger.debug('detectDevice() | React-Native detected');

		if (typeof RTCPeerConnection === 'undefined')
		{
			logger.warn(
				'detectDevice() | unsupported react-native-webrtc without RTCPeerConnection, forgot to call registerGlobals()?');

			return undefined;
		}

		if (typeof RTCRtpTransceiver !== 'undefined')
		{
			logger.debug('detectDevice() | ReactNative UnifiedPlan handler chosen');

			return 'ReactNativeUnifiedPlan';
		}
		else
		{
			logger.debug('detectDevice() | ReactNative PlanB handler chosen');

			return 'ReactNative';
		}
	}
	// Browser.
	else if (typeof navigator === 'object' && typeof navigator.userAgent === 'string')
	{
		const ua = navigator.userAgent;

		const uaParser = new UAParser(ua);

		logger.debug(
			'detectDevice() | browser detected [ua:%s, parsed:%o]',
			ua, uaParser.getResult()
		);

		const browser = uaParser.getBrowser();
		const browserName = browser.name?.toLowerCase() ?? '';
		const browserVersion = parseInt(browser.major ?? '0');
		const engine = uaParser.getEngine();
		const engineName = engine.name?.toLowerCase() ?? '';
		const os = uaParser.getOS();
		const osName = os.name?.toLowerCase() ?? '';
		const osVersion = parseFloat(os.version ?? '0');

		const isIOS = osName === 'ios';

		const isChrome =
		[
			'chrome',
			'chromium',
			'mobile chrome',
			'chrome webview',
			'chrome headless'
		].includes(browserName);

		const isFirefox =
		[
			'firefox',
			'mobile firefox',
			'mobile focus'
		].includes(browserName);

		const isSafari =
		[
			'safari',
			'mobile safari'
		].includes(browserName);

		const isEdge = [ 'edge' ].includes(browserName);

		// Chrome, Chromium, and Edge.
		if ((isChrome || isEdge) && !isIOS && browserVersion >= 111)
		{
			return 'Chrome111';
		}
		else if (
			(isChrome && !isIOS && browserVersion >= 74) ||
			(isEdge && !isIOS && browserVersion >= 88)
		)
		{
			return 'Chrome74';
		}
		else if (isChrome && !isIOS && browserVersion >= 70)
		{
			return 'Chrome70';
		}
		else if (isChrome && !isIOS && browserVersion >= 67)
		{
			return 'Chrome67';
		}
		else if (isChrome && !isIOS && browserVersion >= 55)
		{
			return 'Chrome55';
		}
		// Firefox.
		else if (isFirefox && !isIOS && browserVersion >= 60)
		{
			return 'Firefox60';
		}
		// Firefox on iOS (so Safari).
		else if (isFirefox && isIOS && osVersion >= 14.3)
		{
			return 'Safari12';
		}
		// Safari with Unified-Plan support enabled.
		else if (
			isSafari &&
			browserVersion >= 12 &&
			typeof RTCRtpTransceiver !== 'undefined' &&
			RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
		)
		{
			return 'Safari12';
		}
		// Safari with Plab-B support.
		else if (isSafari && browserVersion >= 11)
		{
			return 'Safari11';
		}
		// Old Edge with ORTC support.
		else if (isEdge && !isIOS && browserVersion >= 11 && browserVersion <= 18)
		{
			return 'Edge11';
		}
		// Best effort for WebKit based browsers in iOS.
		else if (
			engineName === 'webkit' &&
			isIOS &&
			osVersion >= 14.3 &&
			typeof RTCRtpTransceiver !== 'undefined' &&
			RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection'))
		{
			return 'Safari12';
		}
		// Best effort for Chromium based browsers.
		else if (engineName === 'blink')
		{
			const match = ua.match(/(?:(?:Chrome|Chromium))[ /](\w+)/i);

			if (match)
			{
				const version = Number(match[1]);

				if (version >= 111)
				{
					return 'Chrome111';
				}
				else if (version >= 74)
				{
					return 'Chrome74';
				}
				else if (version >= 70)
				{
					return 'Chrome70';
				}
				else if (version >= 67)
				{
					return 'Chrome67';
				}
				else
				{
					return 'Chrome55';
				}
			}
			else
			{
				return 'Chrome111';
			}
		}
		// Unsupported browser.
		else
		{
			logger.warn(
				'detectDevice() | browser not supported [name:%s, version:%s]',
				browserName, browserVersion);

			return undefined;
		}
	}
	// Unknown device.
	else
	{
		logger.warn('detectDevice() | unknown device');

		return undefined;
	}
}

export type DeviceObserverEvents =
{
	newtransport: [Transport];
};

export class Device
{
	// RTC handler factory.
	private readonly _handlerFactory: HandlerFactory;
	// Handler name.
	private readonly _handlerName: string;
	// Loaded flag.
	private _loaded = false;
	// Extended RTP capabilities.
	private _extendedRtpCapabilities?: any;
	// Local RTP capabilities for receiving media.
	private _recvRtpCapabilities?: RtpCapabilities;
	// Whether we can produce audio/video based on computed extended RTP
	// capabilities.
	private readonly _canProduceByKind: CanProduceByKind;
	// Local SCTP capabilities.
	private _sctpCapabilities?: SctpCapabilities;
	// Observer instance.
	protected readonly _observer = new EnhancedEventEmitter<DeviceObserverEvents>();

	/**
	 * Create a new Device to connect to mediasoup server.
	 *
	 * @throws {UnsupportedError} if device is not supported.
	 */
	constructor({ handlerName, handlerFactory, Handler }: DeviceOptions = {})
	{
		logger.debug('constructor()');

		// Handle deprecated option.
		if (Handler)
		{
			logger.warn(
				'constructor() | Handler option is DEPRECATED, use handlerName or handlerFactory instead');

			if (typeof Handler === 'string')
			{
				handlerName = Handler as BuiltinHandlerName;
			}
			else
			{
				throw new TypeError(
					'non string Handler option no longer supported, use handlerFactory instead');
			}
		}

		if (handlerName && handlerFactory)
		{
			throw new TypeError('just one of handlerName or handlerInterface can be given');
		}

		if (handlerFactory)
		{
			this._handlerFactory = handlerFactory;
		}
		else
		{
			if (handlerName)
			{
				logger.debug('constructor() | handler given: %s', handlerName);
			}
			else
			{
				handlerName = detectDevice();

				if (handlerName)
				{
					logger.debug('constructor() | detected handler: %s', handlerName);
				}
				else
				{
					throw new UnsupportedError('device not supported');
				}
			}

			switch (handlerName)
			{
				case 'Chrome111':
					this._handlerFactory = Chrome111.createFactory();
					break;
				case 'Chrome74':
					this._handlerFactory = Chrome74.createFactory();
					break;
				case 'Chrome70':
					this._handlerFactory = Chrome70.createFactory();
					break;
				case 'Chrome67':
					this._handlerFactory = Chrome67.createFactory();
					break;
				case 'Chrome55':
					this._handlerFactory = Chrome55.createFactory();
					break;
				case 'Firefox60':
					this._handlerFactory = Firefox60.createFactory();
					break;
				case 'Safari12':
					this._handlerFactory = Safari12.createFactory();
					break;
				case 'Safari11':
					this._handlerFactory = Safari11.createFactory();
					break;
				case 'Edge11':
					this._handlerFactory = Edge11.createFactory();
					break;
				case 'ReactNativeUnifiedPlan':
					this._handlerFactory = ReactNativeUnifiedPlan.createFactory();
					break;
				case 'ReactNative':
					this._handlerFactory = ReactNative.createFactory();
					break;
				default:
					throw new TypeError(`unknown handlerName "${handlerName}"`);
			}
		}

		// Create a temporal handler to get its name.
		const handler = this._handlerFactory();

		this._handlerName = handler.name;

		handler.close();

		this._extendedRtpCapabilities = undefined;
		this._recvRtpCapabilities = undefined;
		this._canProduceByKind =
		{
			audio : false,
			video : false
		};
		this._sctpCapabilities = undefined;
	}

	/**
	 * The RTC handler name.
	 */
	get handlerName(): string
	{
		return this._handlerName;
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
	get rtpCapabilities(): RtpCapabilities
	{
		if (!this._loaded)
		{
			throw new InvalidStateError('not loaded');
		}

		return this._recvRtpCapabilities!;
	}

	/**
	 * SCTP capabilities of the Device.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 */
	get sctpCapabilities(): SctpCapabilities
	{
		if (!this._loaded)
		{
			throw new InvalidStateError('not loaded');
		}

		return this._sctpCapabilities!;
	}

	get observer(): EnhancedEventEmitter
	{
		return this._observer;
	}

	/**
	 * Initialize the Device.
	 */
	async load(
		{ routerRtpCapabilities }:
		{ routerRtpCapabilities: RtpCapabilities }
	): Promise<void>
	{
		logger.debug('load() [routerRtpCapabilities:%o]', routerRtpCapabilities);

		routerRtpCapabilities = utils.clone(routerRtpCapabilities, undefined);

		// Temporal handler to get its capabilities.
		let handler: HandlerInterface | undefined;

		try
		{
			if (this._loaded)
			{
				throw new InvalidStateError('already loaded');
			}

			// This may throw.
			ortc.validateRtpCapabilities(routerRtpCapabilities);

			handler = this._handlerFactory();

			const nativeRtpCapabilities = await handler.getNativeRtpCapabilities();

			logger.debug(
				'load() | got native RTP capabilities:%o', nativeRtpCapabilities);

			// This may throw.
			ortc.validateRtpCapabilities(nativeRtpCapabilities);

			// Get extended RTP capabilities.
			this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
				nativeRtpCapabilities, routerRtpCapabilities);

			logger.debug(
				'load() | got extended RTP capabilities:%o',
				this._extendedRtpCapabilities);

			// Check whether we can produce audio/video.
			this._canProduceByKind.audio =
				ortc.canSend('audio', this._extendedRtpCapabilities);
			this._canProduceByKind.video =
				ortc.canSend('video', this._extendedRtpCapabilities);

			// Generate our receiving RTP capabilities for receiving media.
			this._recvRtpCapabilities =
				ortc.getRecvRtpCapabilities(this._extendedRtpCapabilities);

			// This may throw.
			ortc.validateRtpCapabilities(this._recvRtpCapabilities);

			logger.debug(
				'load() | got receiving RTP capabilities:%o',
				this._recvRtpCapabilities);

			// Generate our SCTP capabilities.
			this._sctpCapabilities = await handler.getNativeSctpCapabilities();

			logger.debug(
				'load() | got native SCTP capabilities:%o', this._sctpCapabilities);

			// This may throw.
			ortc.validateSctpCapabilities(this._sctpCapabilities);

			logger.debug('load() succeeded');

			this._loaded = true;

			handler.close();
		}
		catch (error)
		{
			if (handler)
			{
				handler.close();
			}

			throw error;
		}
	}

	/**
	 * Whether we can produce audio/video.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	canProduce(kind: MediaKind): boolean
	{
		if (!this._loaded)
		{
			throw new InvalidStateError('not loaded');
		}
		else if (kind !== 'audio' && kind !== 'video')
		{
			throw new TypeError(`invalid kind "${kind}"`);
		}

		return this._canProduceByKind[kind];
	}

	/**
	 * Creates a Transport for sending media.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	createSendTransport<TransportAppData extends AppData = AppData>(
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
			appData
		}: TransportOptions<TransportAppData>
	): Transport<TransportAppData>
	{
		logger.debug('createSendTransport()');

		return this.createTransport<TransportAppData>(
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
	createRecvTransport<TransportAppData extends AppData = AppData>(
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
			appData
		}: TransportOptions<TransportAppData>
	): Transport<TransportAppData>
	{
		logger.debug('createRecvTransport()');

		return this.createTransport<TransportAppData>(
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

	private createTransport<TransportAppData extends AppData>(
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
			appData
		}:
		{
			direction: 'send' | 'recv';
		} & TransportOptions<TransportAppData>
	): Transport<TransportAppData>
	{
		if (!this._loaded)
		{
			throw new InvalidStateError('not loaded');
		}
		else if (typeof id !== 'string')
		{
			throw new TypeError('missing id');
		}
		else if (typeof iceParameters !== 'object')
		{
			throw new TypeError('missing iceParameters');
		}
		else if (!Array.isArray(iceCandidates))
		{
			throw new TypeError('missing iceCandidates');
		}
		else if (typeof dtlsParameters !== 'object')
		{
			throw new TypeError('missing dtlsParameters');
		}
		else if (sctpParameters && typeof sctpParameters !== 'object')
		{
			throw new TypeError('wrong sctpParameters');
		}
		else if (appData && typeof appData !== 'object')
		{
			throw new TypeError('if given, appData must be an object');
		}

		// Create a new Transport.
		const transport = new Transport<TransportAppData>(
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
				handlerFactory          : this._handlerFactory,
				extendedRtpCapabilities : this._extendedRtpCapabilities,
				canProduceByKind        : this._canProduceByKind
			});

		// Emit observer event.
		this._observer.safeEmit('newtransport', transport);

		return transport;
	}
}
