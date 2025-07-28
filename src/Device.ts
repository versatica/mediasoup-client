import { UAParser } from 'ua-parser-js';
import { Logger } from './Logger';
import { EnhancedEventEmitter } from './enhancedEvents';
import { UnsupportedError, InvalidStateError } from './errors';
import * as utils from './utils';
import * as ortc from './ortc';
import {
	Transport,
	type TransportOptions,
	type CanProduceByKind,
} from './Transport';
import {
	type HandlerFactory,
	HandlerInterface,
} from './handlers/HandlerInterface';
import { Chrome111 } from './handlers/Chrome111';
import { Chrome74 } from './handlers/Chrome74';
import { Firefox120 } from './handlers/Firefox120';
import { Safari12 } from './handlers/Safari12';
import { ReactNative106 } from './handlers/ReactNative106';
import type { RtpCapabilities, MediaKind } from './RtpParameters';
import type { SctpCapabilities } from './SctpParameters';
import type { AppData } from './types';
import type { ExtendedRtpCapabilities } from './privateTypes';

const logger = new Logger('Device');

export type BuiltinHandlerName =
	| 'Chrome111'
	| 'Chrome74'
	| 'Firefox120'
	| 'Safari12'
	| 'ReactNative106';

export type DeviceOptions = {
	/**
	 * The name of one of the builtin handlers.
	 */
	handlerName?: BuiltinHandlerName;
	/**
	 * Custom handler factory.
	 */
	handlerFactory?: HandlerFactory;
};

/**
 * Async mediasoup-client Handler detection. More powerful than
 * `detectDevice()`.
 */
export async function detectDeviceAsync(
	userAgent?: string
): Promise<BuiltinHandlerName | undefined> {
	logger.debug('detectDeviceAsync() [userAgent:%s]', userAgent);

	if (!userAgent && typeof navigator === 'object') {
		userAgent = navigator.userAgent;
	}

	const uaParserResult = await UAParser(userAgent).withFeatureCheck();

	return detectDeviceImpl(uaParserResult);
}

/**
 * Sync mediasoup-client Handler detection.
 *
 * @deprecated It only relies on navigator.userAgent. Use `detectDeviceAsync()`
 * instead.
 */
export function detectDevice(
	userAgent?: string
): BuiltinHandlerName | undefined {
	logger.debug('detectDevice() [userAgent:%s]', userAgent);

	if (!userAgent && typeof navigator === 'object') {
		userAgent = navigator.userAgent;
	}

	const uaParserResult = UAParser(userAgent);

	return detectDeviceImpl(uaParserResult);
}

export type DeviceObserver = EnhancedEventEmitter<DeviceObserverEvents>;

export type DeviceObserverEvents = {
	newtransport: [Transport];
};

export class Device {
	// RTC handler factory.
	private readonly _handlerFactory: HandlerFactory;
	// Handler name.
	private readonly _handlerName: string;
	// Loaded flag.
	private _loaded = false;
	// Extended RTP capabilities.
	private _extendedRtpCapabilities?: ExtendedRtpCapabilities;
	// Local RTP capabilities for receiving media.
	private _recvRtpCapabilities?: RtpCapabilities;
	// Whether we can produce audio/video based on computed extended RTP
	// capabilities.
	private readonly _canProduceByKind: CanProduceByKind;
	// Local SCTP capabilities.
	private _sctpCapabilities?: SctpCapabilities;
	// Observer instance.
	protected readonly _observer: DeviceObserver =
		new EnhancedEventEmitter<DeviceObserverEvents>();

	/**
	 * Create a new Device to connect to mediasoup server. It uses a more advanced
	 * device detection.
	 *
	 * @throws {UnsupportedError} if device is not supported.
	 */
	static async factory({
		handlerName,
		handlerFactory,
	}: DeviceOptions = {}): Promise<Device> {
		logger.debug('factory()');

		if (handlerName && handlerFactory) {
			throw new TypeError(
				'just one of handlerName or handlerInterface can be given'
			);
		}

		if (!handlerName && !handlerFactory) {
			handlerName = await detectDeviceAsync();

			if (!handlerName) {
				throw new UnsupportedError('device not supported');
			}
		}

		return new Device({ handlerName, handlerFactory });
	}

	/**
	 * Create a new Device to connect to mediasoup server.
	 *
	 * @throws {UnsupportedError} if device is not supported.
	 */
	constructor({ handlerName, handlerFactory }: DeviceOptions = {}) {
		logger.debug('constructor()');

		if (handlerName && handlerFactory) {
			throw new TypeError(
				'just one of handlerName or handlerInterface can be given'
			);
		}

		if (handlerFactory) {
			this._handlerFactory = handlerFactory;
		} else {
			if (handlerName) {
				logger.debug('constructor() | handler given: %s', handlerName);
			} else {
				handlerName = detectDevice();

				if (handlerName) {
					logger.debug('constructor() | detected handler: %s', handlerName);
				} else {
					throw new UnsupportedError('device not supported');
				}
			}

			switch (handlerName) {
				case 'Chrome111': {
					this._handlerFactory = Chrome111.createFactory();

					break;
				}

				case 'Chrome74': {
					this._handlerFactory = Chrome74.createFactory();

					break;
				}

				case 'Firefox120': {
					this._handlerFactory = Firefox120.createFactory();

					break;
				}

				case 'Safari12': {
					this._handlerFactory = Safari12.createFactory();

					break;
				}

				case 'ReactNative106': {
					this._handlerFactory = ReactNative106.createFactory();

					break;
				}

				default: {
					throw new TypeError(`unknown handlerName "${handlerName}"`);
				}
			}
		}

		// Create a temporal handler to get its name.
		const handler = this._handlerFactory();

		this._handlerName = handler.name;

		handler.close();

		this._extendedRtpCapabilities = undefined;
		this._recvRtpCapabilities = undefined;
		this._canProduceByKind = {
			audio: false,
			video: false,
		};
		this._sctpCapabilities = undefined;
	}

	/**
	 * The RTC handler name.
	 */
	get handlerName(): string {
		return this._handlerName;
	}

	/**
	 * Whether the Device is loaded.
	 */
	get loaded(): boolean {
		return this._loaded;
	}

	/**
	 * RTP capabilities of the Device for receiving media.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 */
	get rtpCapabilities(): RtpCapabilities {
		if (!this._loaded) {
			throw new InvalidStateError('not loaded');
		}

		return this._recvRtpCapabilities!;
	}

	/**
	 * SCTP capabilities of the Device.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 */
	get sctpCapabilities(): SctpCapabilities {
		if (!this._loaded) {
			throw new InvalidStateError('not loaded');
		}

		return this._sctpCapabilities!;
	}

	get observer(): DeviceObserver {
		return this._observer;
	}

	/**
	 * Initialize the Device.
	 */
	async load({
		routerRtpCapabilities,
		preferLocalCodecsOrder = false,
	}: {
		routerRtpCapabilities: RtpCapabilities;
		preferLocalCodecsOrder?: boolean;
	}): Promise<void> {
		logger.debug('load() [routerRtpCapabilities:%o]', routerRtpCapabilities);

		// Temporal handler to get its capabilities.
		let handler: HandlerInterface | undefined;

		try {
			if (this._loaded) {
				throw new InvalidStateError('already loaded');
			}

			// Clone given router RTP capabilities to not modify input data.
			const clonedRouterRtpCapabilities = utils.clone<RtpCapabilities>(
				routerRtpCapabilities
			);

			// This may throw.
			ortc.validateRtpCapabilities(clonedRouterRtpCapabilities);

			handler = this._handlerFactory();

			const nativeRtpCapabilities = await handler.getNativeRtpCapabilities();

			logger.debug(
				'load() | got native RTP capabilities:%o',
				nativeRtpCapabilities
			);

			// Clone obtained native RTP capabilities to not modify input data.
			const clonedNativeRtpCapabilities = utils.clone<RtpCapabilities>(
				nativeRtpCapabilities
			);

			// This may throw.
			ortc.validateRtpCapabilities(clonedNativeRtpCapabilities);

			// Get extended RTP capabilities.
			this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
				clonedNativeRtpCapabilities,
				clonedRouterRtpCapabilities,
				preferLocalCodecsOrder
			);

			logger.debug(
				'load() | got extended RTP capabilities:%o',
				this._extendedRtpCapabilities
			);

			// Check whether we can produce audio/video.
			this._canProduceByKind.audio = ortc.canSend(
				'audio',
				this._extendedRtpCapabilities
			);
			this._canProduceByKind.video = ortc.canSend(
				'video',
				this._extendedRtpCapabilities
			);

			// Generate our receiving RTP capabilities for receiving media.
			this._recvRtpCapabilities = ortc.getRecvRtpCapabilities(
				this._extendedRtpCapabilities
			);

			// This may throw.
			ortc.validateRtpCapabilities(this._recvRtpCapabilities);

			logger.debug(
				'load() | got receiving RTP capabilities:%o',
				this._recvRtpCapabilities
			);

			// Generate our SCTP capabilities.
			this._sctpCapabilities = await handler.getNativeSctpCapabilities();

			logger.debug(
				'load() | got native SCTP capabilities:%o',
				this._sctpCapabilities
			);

			// This may throw.
			ortc.validateSctpCapabilities(this._sctpCapabilities);

			logger.debug('load() succeeded');

			this._loaded = true;

			handler.close();
		} catch (error) {
			if (handler) {
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
	canProduce(kind: MediaKind): boolean {
		if (!this._loaded) {
			throw new InvalidStateError('not loaded');
		} else if (kind !== 'audio' && kind !== 'video') {
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
	createSendTransport<TransportAppData extends AppData = AppData>({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		iceServers,
		iceTransportPolicy,
		additionalSettings,
		appData,
	}: TransportOptions<TransportAppData>): Transport<TransportAppData> {
		logger.debug('createSendTransport()');

		return this.createTransport<TransportAppData>({
			direction: 'send',
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			appData,
		});
	}

	/**
	 * Creates a Transport for receiving media.
	 *
	 * @throws {InvalidStateError} if not loaded.
	 * @throws {TypeError} if wrong arguments.
	 */
	createRecvTransport<TransportAppData extends AppData = AppData>({
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		iceServers,
		iceTransportPolicy,
		additionalSettings,
		appData,
	}: TransportOptions<TransportAppData>): Transport<TransportAppData> {
		logger.debug('createRecvTransport()');

		return this.createTransport<TransportAppData>({
			direction: 'recv',
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			appData,
		});
	}

	private createTransport<TransportAppData extends AppData>({
		direction,
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters,
		iceServers,
		iceTransportPolicy,
		additionalSettings,
		appData,
	}: {
		direction: 'send' | 'recv';
	} & TransportOptions<TransportAppData>): Transport<TransportAppData> {
		if (!this._loaded) {
			throw new InvalidStateError('not loaded');
		} else if (typeof id !== 'string') {
			throw new TypeError('missing id');
		} else if (typeof iceParameters !== 'object') {
			throw new TypeError('missing iceParameters');
		} else if (!Array.isArray(iceCandidates)) {
			throw new TypeError('missing iceCandidates');
		} else if (typeof dtlsParameters !== 'object') {
			throw new TypeError('missing dtlsParameters');
		} else if (sctpParameters && typeof sctpParameters !== 'object') {
			throw new TypeError('wrong sctpParameters');
		} else if (appData && typeof appData !== 'object') {
			throw new TypeError('if given, appData must be an object');
		}

		// Create a new Transport.
		const transport: Transport<TransportAppData> = new Transport({
			direction,
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			iceServers,
			iceTransportPolicy,
			additionalSettings,
			appData,
			handlerFactory: this._handlerFactory,
			extendedRtpCapabilities: this._extendedRtpCapabilities!,
			canProduceByKind: this._canProduceByKind,
		});

		// Emit observer event.
		this._observer.safeEmit('newtransport', transport);

		return transport;
	}
}

function detectDeviceImpl(
	uaParserResult: UAParser.IResult
): BuiltinHandlerName | undefined {
	// React-Native.
	if (typeof navigator === 'object' && navigator.product === 'ReactNative') {
		logger.debug('detectDeviceImpl() | React-Native detected');

		if (
			typeof RTCPeerConnection === 'undefined' ||
			typeof RTCRtpTransceiver === 'undefined'
		) {
			logger.warn(
				'detectDeviceImpl() | unsupported react-native-webrtc without RTCPeerConnection or RTCRtpTransceiver, forgot to call registerGlobals() on it?'
			);

			return undefined;
		}

		return 'ReactNative106';
	}
	// Browser.
	else {
		logger.debug(
			'detectDeviceImpl() | browser detected [userAgent:%s, parsed:%o]',
			uaParserResult.ua,
			uaParserResult
		);

		const browser = uaParserResult.browser;
		const browserName = browser.name?.toLowerCase();
		const browserVersion = parseInt(browser.major ?? '0');
		const engine = uaParserResult.engine;
		const engineName = engine.name?.toLowerCase();
		const os = uaParserResult.os;
		const osName = os.name?.toLowerCase();
		const osVersion = parseFloat(os.version ?? '0');
		const device = uaParserResult.device;
		const deviceModel = device.model?.toLowerCase();

		const isIOS = osName === 'ios' || deviceModel === 'ipad';

		const isChrome =
			browserName &&
			[
				'chrome',
				'chromium',
				'mobile chrome',
				'chrome webview',
				'chrome headless',
			].includes(browserName);

		const isFirefox =
			browserName &&
			['firefox', 'mobile firefox', 'mobile focus'].includes(browserName);

		const isSafari =
			browserName && ['safari', 'mobile safari'].includes(browserName);

		const isEdge = browserName && ['edge'].includes(browserName);

		// Chrome, Chromium, and Edge.
		if ((isChrome || isEdge) && !isIOS && browserVersion >= 111) {
			return 'Chrome111';
		} else if (
			(isChrome && !isIOS && browserVersion >= 74) ||
			(isEdge && !isIOS && browserVersion >= 88)
		) {
			return 'Chrome74';
		}
		// Firefox.
		else if (isFirefox && !isIOS && browserVersion >= 120) {
			return 'Firefox120';
		}
		// Firefox on iOS (so Safari).
		else if (isFirefox && isIOS && osVersion >= 14.3) {
			return 'Safari12';
		}
		// Safari with Unified-Plan support enabled.
		else if (
			isSafari &&
			browserVersion >= 12 &&
			typeof RTCRtpTransceiver !== 'undefined' &&
			RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
		) {
			return 'Safari12';
		}
		// Best effort for WebKit based browsers in iOS.
		else if (
			engineName === 'webkit' &&
			isIOS &&
			typeof RTCRtpTransceiver !== 'undefined' &&
			RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
		) {
			return 'Safari12';
		}
		// Best effort for Chromium based browsers.
		else if (engineName === 'blink') {
			// eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
			const match = uaParserResult.ua.match(
				/(?:(?:Chrome|Chromium))[ /](\w+)/i
			);

			if (match) {
				const version = Number(match[1]);

				if (version >= 111) {
					return 'Chrome111';
				} else {
					return 'Chrome74';
				}
			} else {
				return 'Chrome111';
			}
		}
		// Unsupported browser.
		else {
			logger.warn(
				'detectDeviceImpl() | browser not supported [name:%s, version:%s]',
				browserName,
				browserVersion
			);

			return undefined;
		}
	}
}
