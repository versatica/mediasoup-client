"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = __importDefault(require("./Logger"));
const errors_1 = require("./errors");
const detectDevice_1 = __importDefault(require("./detectDevice"));
const ortc = __importStar(require("./ortc"));
const Transport_1 = require("./Transport");
const Chrome74_1 = __importDefault(require("./handlers/Chrome74"));
const Chrome70_1 = __importDefault(require("./handlers/Chrome70"));
const Chrome67_1 = __importDefault(require("./handlers/Chrome67"));
const Chrome55_1 = __importDefault(require("./handlers/Chrome55"));
const Firefox60_1 = __importDefault(require("./handlers/Firefox60"));
const Safari12_1 = __importDefault(require("./handlers/Safari12"));
const Safari11_1 = __importDefault(require("./handlers/Safari11"));
const Edge11_1 = __importDefault(require("./handlers/Edge11"));
const ReactNative_1 = __importDefault(require("./handlers/ReactNative"));
const logger = new Logger_1.default('Device');
class Device {
    /**
     * Create a new Device to connect to mediasoup server.
     *
     * @param {Class|String} [Handler] - An optional RTC handler class for unsupported or
     *   custom devices (not needed when running in a browser). If a String, it will
     *   force usage of the given built-in handler.
     *
     * @throws {UnsupportedError} if device is not supported.
     */
    constructor({ Handler } = {}) {
        // Loaded flag.
        this._loaded = false;
        if (typeof Handler === 'string') {
            switch (Handler) {
                case 'Chrome74':
                    Handler = Chrome74_1.default;
                    break;
                case 'Chrome70':
                    Handler = Chrome70_1.default;
                    break;
                case 'Chrome67':
                    Handler = Chrome67_1.default;
                    break;
                case 'Chrome55':
                    Handler = Chrome55_1.default;
                    break;
                case 'Firefox60':
                    Handler = Firefox60_1.default;
                    break;
                case 'Safari12':
                    Handler = Safari12_1.default;
                    break;
                case 'Safari11':
                    Handler = Safari11_1.default;
                    break;
                case 'Edge11':
                    Handler = Edge11_1.default;
                    break;
                case 'ReactNative':
                    Handler = ReactNative_1.default;
                    break;
                default:
                    throw new TypeError(`unknown Handler "${Handler}"`);
            }
        }
        // RTC handler class.
        this._Handler = Handler || detectDevice_1.default();
        if (!this._Handler)
            throw new errors_1.UnsupportedError('device not supported');
        logger.debug('constructor() [Handler:%s]', this._Handler.name);
        this._extendedRtpCapabilities = null;
        this._recvRtpCapabilities = undefined;
        this._canProduceByKind =
            {
                audio: false,
                video: false
            };
        this._sctpCapabilities = null;
    }
    /**
     * The RTC handler class name ('Chrome70', 'Firefox65', etc).
     */
    get handlerName() {
        return this._Handler.name;
    }
    /**
     * Whether the Device is loaded.
     */
    get loaded() {
        return this._loaded;
    }
    /**
     * RTP capabilities of the Device for receiving media.
     *
     * @throws {InvalidStateError} if not loaded.
     */
    get rtpCapabilities() {
        if (!this._loaded)
            throw new errors_1.InvalidStateError('not loaded');
        return this._recvRtpCapabilities;
    }
    /**
     * SCTP capabilities of the Device.
     *
     * @throws {InvalidStateError} if not loaded.
     */
    get sctpCapabilities() {
        if (!this._loaded)
            throw new errors_1.InvalidStateError('not loaded');
        return this._sctpCapabilities;
    }
    /**
     * Initialize the Device.
     *
     * @throws {TypeError} if missing/wrong arguments.
     * @throws {InvalidStateError} if already loaded.
     */
    load({ routerRtpCapabilities } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('load() [routerRtpCapabilities:%o]', routerRtpCapabilities);
            if (this._loaded)
                throw new errors_1.InvalidStateError('already loaded');
            else if (typeof routerRtpCapabilities !== 'object')
                throw new TypeError('missing routerRtpCapabilities');
            const nativeRtpCapabilities = yield this._Handler.getNativeRtpCapabilities();
            logger.debug('load() | got native RTP capabilities:%o', nativeRtpCapabilities);
            // Get extended RTP capabilities.
            this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(nativeRtpCapabilities, routerRtpCapabilities);
            logger.debug('load() | got extended RTP capabilities:%o', this._extendedRtpCapabilities);
            // Check whether we can produce audio/video.
            this._canProduceByKind.audio =
                ortc.canSend('audio', this._extendedRtpCapabilities);
            this._canProduceByKind.video =
                ortc.canSend('video', this._extendedRtpCapabilities);
            // Generate our receiving RTP capabilities for receiving media.
            this._recvRtpCapabilities =
                ortc.getRecvRtpCapabilities(this._extendedRtpCapabilities);
            logger.debug('load() | got receiving RTP capabilities:%o', this._recvRtpCapabilities);
            this._sctpCapabilities = yield this._Handler.getNativeSctpCapabilities();
            logger.debug('load() | got native SCTP capabilities:%o', this._sctpCapabilities);
            logger.debug('load() succeeded');
            this._loaded = true;
        });
    }
    /**
     * Whether we can produce audio/video.
     *
     * @throws {InvalidStateError} if not loaded.
     * @throws {TypeError} if wrong arguments.
     */
    canProduce(kind) {
        if (!this._loaded)
            throw new errors_1.InvalidStateError('not loaded');
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
    createSendTransport({ id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData = {} }) {
        logger.debug('createSendTransport()');
        return this._createTransport({
            direction: 'send',
            id: id,
            iceParameters: iceParameters,
            iceCandidates: iceCandidates,
            dtlsParameters: dtlsParameters,
            sctpParameters: sctpParameters,
            iceServers: iceServers,
            iceTransportPolicy: iceTransportPolicy,
            additionalSettings: additionalSettings,
            proprietaryConstraints: proprietaryConstraints,
            appData: appData
        });
    }
    /**
     * Creates a Transport for receiving media.
     *
     * @throws {InvalidStateError} if not loaded.
     * @throws {TypeError} if wrong arguments.
     */
    createRecvTransport({ id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData = {} }) {
        logger.debug('createRecvTransport()');
        return this._createTransport({
            direction: 'recv',
            id: id,
            iceParameters: iceParameters,
            iceCandidates: iceCandidates,
            dtlsParameters: dtlsParameters,
            sctpParameters: sctpParameters,
            iceServers: iceServers,
            iceTransportPolicy: iceTransportPolicy,
            additionalSettings: additionalSettings,
            proprietaryConstraints: proprietaryConstraints,
            appData: appData
        });
    }
    /**
     * @private
     */
    _createTransport({ direction, id, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, appData = {} }) {
        logger.debug('createTransport()');
        if (!this._loaded)
            throw new errors_1.InvalidStateError('not loaded');
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
        const transport = new Transport_1.Transport({
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
            Handler: this._Handler,
            extendedRtpCapabilities: this._extendedRtpCapabilities,
            canProduceByKind: this._canProduceByKind
        });
        return transport;
    }
}
exports.default = Device;
