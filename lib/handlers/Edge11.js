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
const Logger_1 = __importDefault(require("../Logger"));
const EnhancedEventEmitter_1 = __importDefault(require("../EnhancedEventEmitter"));
const errors_1 = require("../errors");
const utils = __importStar(require("../utils"));
const ortc = __importStar(require("../ortc"));
const edgeUtils = __importStar(require("./ortc/edgeUtils"));
const logger = new Logger_1.default('Edge11');
class Edge11 extends EnhancedEventEmitter_1.default {
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, iceServers, iceTransportPolicy, proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
    extendedRtpCapabilities }) {
        super(logger);
        // Got transport local and remote parameters.
        this._transportReady = false;
        // ICE gatherer.
        this._iceGatherer = null;
        // ICE transport.
        this._iceTransport = null;
        // DTLS transport.
        this._dtlsTransport = null;
        // Map of RTCRtpSenders indexed by id.
        this._rtpSenders = new Map();
        // Map of RTCRtpReceivers indexed by id.
        this._rtpReceivers = new Map();
        // Latest localId for sending tracks.
        this._lastSendId = 0;
        logger.debug('constructor() [direction:%s]', direction);
        this._sendingRtpParametersByKind =
            {
                audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
            };
        this._remoteIceParameters = iceParameters;
        this._remoteIceCandidates = iceCandidates;
        this._remoteDtlsParameters = dtlsParameters;
        this._cname = `CNAME-${utils.generateRandomNumber()}`;
        this._setIceGatherer({ iceServers, iceTransportPolicy });
        this._setIceTransport();
        this._setDtlsTransport();
    }
    static get label() {
        return 'Edge11';
    }
    static getNativeRtpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeRtpCapabilities()');
            return edgeUtils.getCapabilities();
        });
    }
    static getNativeSctpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeSctpCapabilities()');
            return {
                numStreams: 0
            };
        });
    }
    close() {
        logger.debug('close()');
        // Close the ICE gatherer.
        // NOTE: Not yet implemented by Edge.
        try {
            this._iceGatherer.close();
        }
        catch (error) { }
        // Close the ICE transport.
        try {
            this._iceTransport.stop();
        }
        catch (error) { }
        // Close the DTLS transport.
        try {
            this._dtlsTransport.stop();
        }
        catch (error) { }
        // Close RTCRtpSenders.
        for (const rtpSender of this._rtpSenders.values()) {
            try {
                rtpSender.stop();
            }
            catch (error) { }
        }
        // Close RTCRtpReceivers.
        for (const rtpReceiver of this._rtpReceivers.values()) {
            try {
                rtpReceiver.stop();
            }
            catch (error) { }
        }
    }
    getTransportStats() {
        return __awaiter(this, void 0, void 0, function* () {
            return this._iceTransport.getStats();
        });
    }
    send({ track, encodings }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'server' });
            logger.debug('send() | calling new RTCRtpSender()');
            const rtpSender = new RTCRtpSender(track, this._dtlsTransport);
            const rtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
            const useRtx = rtpParameters.codecs
                .some((codec) => /.+\/rtx$/i.test(codec.mimeType));
            if (!encodings)
                encodings = [{}];
            for (const encoding of encodings) {
                encoding.ssrc = utils.generateRandomNumber();
                if (useRtx)
                    encoding.rtx = { ssrc: utils.generateRandomNumber() };
            }
            rtpParameters.encodings = encodings;
            // Fill RTCRtpParameters.rtcp.
            rtpParameters.rtcp =
                {
                    cname: this._cname,
                    reducedSize: true,
                    mux: true
                };
            // NOTE: Convert our standard RTCRtpParameters into those that Edge
            // expects.
            const edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);
            logger.debug('send() | calling rtpSender.send() [params:%o]', edgeRtpParameters);
            yield rtpSender.send(edgeRtpParameters);
            this._lastSendId++;
            // Store it.
            this._rtpSenders.set(`${this._lastSendId}`, rtpSender);
            return { localId: `${this._lastSendId}`, rtpParameters };
        });
    }
    stopSending({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('stopSending() [localId:%s]', localId);
            const rtpSender = this._rtpSenders.get(localId);
            if (!rtpSender)
                throw new Error('RTCRtpSender not found');
            this._rtpSenders.delete(localId);
            try {
                logger.debug('stopSending() | calling rtpSender.stop()');
                rtpSender.stop();
            }
            catch (error) {
                logger.warn('stopSending() | rtpSender.stop() failed:%o', error);
                throw error;
            }
        });
    }
    replaceTrack({ localId, track }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
            const rtpSender = this._rtpSenders.get(localId);
            if (!rtpSender)
                throw new Error('RTCRtpSender not found');
            const oldTrack = rtpSender.track;
            rtpSender.setTrack(track);
            // Replace key.
            this._rtpSenders.delete(oldTrack.id);
            this._rtpSenders.set(track.id, rtpSender);
        });
    }
    setMaxSpatialLayer({ localId, spatialLayer }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
            const rtpSender = this._rtpSenders.get(localId);
            if (!rtpSender)
                throw new Error('RTCRtpSender not found');
            const parameters = rtpSender.getParameters();
            parameters.encodings
                .forEach((encoding, idx) => {
                if (idx <= spatialLayer)
                    encoding.active = true;
                else
                    encoding.active = false;
            });
            yield rtpSender.setParameters(parameters);
        });
    }
    setRtpEncodingParameters({ localId, params }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
            const rtpSender = this._rtpSenders.get(localId);
            if (!rtpSender)
                throw new Error('RTCRtpSender not found');
            const parameters = rtpSender.getParameters();
            parameters.encodings.forEach((encoding, idx) => {
                parameters.encodings[idx] = Object.assign(Object.assign({}, encoding), params);
            });
            yield rtpSender.setParameters(parameters);
        });
    }
    getSenderStats({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const rtpSender = this._rtpSenders.get(localId);
            if (!rtpSender)
                throw new Error('RTCRtpSender not found');
            return rtpSender.getStats();
        });
    }
    sendDataChannel() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    receive({ id, kind, rtpParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('receive() [id:%s, kind:%s]', id, kind);
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'server' });
            logger.debug('receive() | calling new RTCRtpReceiver()');
            const rtpReceiver = new RTCRtpReceiver(this._dtlsTransport, kind);
            rtpReceiver.addEventListener('error', (event) => {
                logger.error('iceGatherer "error" event [event:%o]', event);
            });
            // NOTE: Convert our standard RTCRtpParameters into those that Edge
            // expects.
            const edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);
            logger.debug('receive() | calling rtpReceiver.receive() [params:%o]', edgeRtpParameters);
            yield rtpReceiver.receive(edgeRtpParameters);
            const localId = id;
            // Store it.
            this._rtpReceivers.set(localId, rtpReceiver);
            return { localId, track: rtpReceiver.track };
        });
    }
    stopReceiving({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('stopReceiving() [localId:%s]', localId);
            const rtpReceiver = this._rtpReceivers.get(localId);
            if (!rtpReceiver)
                throw new Error('RTCRtpReceiver not found');
            this._rtpReceivers.delete(localId);
            try {
                logger.debug('stopReceiving() | calling rtpReceiver.stop()');
                rtpReceiver.stop();
            }
            catch (error) {
                logger.warn('stopReceiving() | rtpReceiver.stop() failed:%o', error);
            }
        });
    }
    getReceiverStats({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const rtpReceiver = this._rtpReceivers.get(localId);
            if (!rtpReceiver)
                throw new Error('RTCRtpReceiver not found');
            return rtpReceiver.getStats();
        });
    }
    receiveDataChannel() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    restartIce({ iceParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('restartIce()');
            this._remoteIceParameters = iceParameters;
            if (!this._transportReady)
                return;
            logger.debug('restartIce() | calling iceTransport.start()');
            this._iceTransport.start(this._iceGatherer, iceParameters, 'controlling');
            for (const candidate of this._remoteIceCandidates) {
                this._iceTransport.addRemoteCandidate(candidate);
            }
            this._iceTransport.addRemoteCandidate({});
        });
    }
    updateIceServers({ iceServers }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('updateIceServers()');
            // NOTE: Edge 11 does not implement iceGatherer.gater().
            throw new errors_1.UnsupportedError('not supported');
        });
    }
    _setIceGatherer({ iceServers, iceTransportPolicy }) {
        const iceGatherer = new RTCIceGatherer({
            iceServers: iceServers || [],
            gatherPolicy: iceTransportPolicy || 'all'
        });
        iceGatherer.addEventListener('error', (event) => {
            logger.error('iceGatherer "error" event [event:%o]', event);
        });
        // NOTE: Not yet implemented by Edge, which starts gathering automatically.
        try {
            iceGatherer.gather();
        }
        catch (error) {
            logger.debug('_setIceGatherer() | iceGatherer.gather() failed: %s', error.toString());
        }
        this._iceGatherer = iceGatherer;
    }
    _setIceTransport() {
        const iceTransport = new RTCIceTransport(this._iceGatherer);
        // NOTE: Not yet implemented by Edge.
        iceTransport.addEventListener('statechange', () => {
            switch (iceTransport.state) {
                case 'checking':
                    this.emit('@connectionstatechange', 'connecting');
                    break;
                case 'connected':
                case 'completed':
                    this.emit('@connectionstatechange', 'connected');
                    break;
                case 'failed':
                    this.emit('@connectionstatechange', 'failed');
                    break;
                case 'disconnected':
                    this.emit('@connectionstatechange', 'disconnected');
                    break;
                case 'closed':
                    this.emit('@connectionstatechange', 'closed');
                    break;
            }
        });
        // NOTE: Not standard, but implemented by Edge.
        iceTransport.addEventListener('icestatechange', () => {
            switch (iceTransport.state) {
                case 'checking':
                    this.emit('@connectionstatechange', 'connecting');
                    break;
                case 'connected':
                case 'completed':
                    this.emit('@connectionstatechange', 'connected');
                    break;
                case 'failed':
                    this.emit('@connectionstatechange', 'failed');
                    break;
                case 'disconnected':
                    this.emit('@connectionstatechange', 'disconnected');
                    break;
                case 'closed':
                    this.emit('@connectionstatechange', 'closed');
                    break;
            }
        });
        iceTransport.addEventListener('candidatepairchange', (event) => {
            logger.debug('iceTransport "candidatepairchange" event [pair:%o]', event.pair);
        });
        this._iceTransport = iceTransport;
    }
    _setDtlsTransport() {
        const dtlsTransport = new RTCDtlsTransport(this._iceTransport);
        // NOTE: Not yet implemented by Edge.
        dtlsTransport.addEventListener('statechange', () => {
            logger.debug('dtlsTransport "statechange" event [state:%s]', dtlsTransport.state);
        });
        // NOTE: Not standard, but implemented by Edge.
        dtlsTransport.addEventListener('dtlsstatechange', () => {
            logger.debug('dtlsTransport "dtlsstatechange" event [state:%s]', dtlsTransport.state);
            if (dtlsTransport.state === 'closed')
                this.emit('@connectionstatechange', 'closed');
        });
        dtlsTransport.addEventListener('error', (event) => {
            logger.error('dtlsTransport "error" event [event:%o]', event);
        });
        this._dtlsTransport = dtlsTransport;
    }
    _setupTransport({ localDtlsRole }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('_setupTransport()');
            // Get our local DTLS parameters.
            const dtlsParameters = this._dtlsTransport.getLocalParameters();
            dtlsParameters.role = localDtlsRole;
            // Need to tell the remote transport about our parameters.
            yield this.safeEmitAsPromise('@connect', { dtlsParameters });
            // Start the RTCIceTransport.
            this._iceTransport.start(this._iceGatherer, this._remoteIceParameters, 'controlling');
            // Add remote ICE candidates.
            for (const candidate of this._remoteIceCandidates) {
                this._iceTransport.addRemoteCandidate(candidate);
            }
            // Also signal a 'complete' candidate as per spec.
            // NOTE: It should be {complete: true} but Edge prefers {}.
            // NOTE: If we don't signal end of candidates, the Edge RTCIceTransport
            // won't enter the 'completed' state.
            this._iceTransport.addRemoteCandidate({});
            // NOTE: Edge does not like SHA less than 256.
            this._remoteDtlsParameters.fingerprints = this._remoteDtlsParameters.fingerprints
                .filter((fingerprint) => {
                return (fingerprint.algorithm === 'sha-256' ||
                    fingerprint.algorithm === 'sha-384' ||
                    fingerprint.algorithm === 'sha-512');
            });
            // Start the RTCDtlsTransport.
            this._dtlsTransport.start(this._remoteDtlsParameters);
            this._transportReady = true;
        });
    }
}
exports.default = Edge11;
