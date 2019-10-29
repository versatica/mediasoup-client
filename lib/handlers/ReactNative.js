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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdpTransform = __importStar(require("sdp-transform"));
const Logger_1 = __importDefault(require("../Logger"));
const EnhancedEventEmitter_1 = __importDefault(require("../EnhancedEventEmitter"));
const errors_1 = require("../errors");
const utils = __importStar(require("../utils"));
const ortc = __importStar(require("../ortc"));
const sdpCommonUtils = __importStar(require("./sdp/commonUtils"));
const sdpPlanBUtils = __importStar(require("./sdp/planBUtils"));
const RemoteSdp_1 = __importDefault(require("./sdp/RemoteSdp"));
const logger = new Logger_1.default('ReactNative');
const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
class Handler extends EnhancedEventEmitter_1.default {
    constructor({ iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints }) {
        super(logger);
        // Got transport local and remote parameters.
        this._transportReady = false;
        // Whether a DataChannel m=application section has been created.
        this._hasDataChannelMediaSection = false;
        // DataChannel id value counter. It must be incremented for each new DataChannel.
        this._nextSctpStreamId = 0;
        this._remoteSdp = new RemoteSdp_1.default({
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters,
            planB: true
        });
        this._pc = new RTCPeerConnection(Object.assign({ iceServers: iceServers || [], iceTransportPolicy: iceTransportPolicy || 'all', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require', sdpSemantics: 'plan-b' }, additionalSettings), proprietaryConstraints);
        // Handle RTCPeerConnection connection status.
        this._pc.addEventListener('iceconnectionstatechange', () => {
            switch (this._pc.iceConnectionState) {
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
    }
    close() {
        logger.debug('close()');
        // Close RTCPeerConnection.
        try {
            this._pc.close();
        }
        catch (error) { }
    }
    getTransportStats() {
        return __awaiter(this, void 0, void 0, function* () {
            return this._pc.getStats();
        });
    }
    updateIceServers({ iceServers } // eslint-disable-line no-unused-vars
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('updateIceServers()');
            const configuration = this._pc.getConfiguration();
            configuration.iceServers = iceServers;
            this._pc.setConfiguration(configuration);
        });
    }
    _setupTransport({ localDtlsRole, localSdpObject = null }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!localSdpObject)
                localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
            // Get our local DTLS parameters.
            const dtlsParameters = sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });
            // Set our DTLS role.
            dtlsParameters.role = localDtlsRole;
            // Update the remote DTLS role in the SDP.
            this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
            // Need to tell the remote transport about our parameters.
            yield this.safeEmitAsPromise('@connect', { dtlsParameters });
            this._transportReady = true;
        });
    }
}
class SendHandler extends Handler {
    constructor(data) {
        super(data);
        // Local stream.
        this._stream = new MediaStream();
        // Map of MediaStreamTracks indexed by localId.
        this._mapIdTrack = new Map();
        // Latest localId.
        this._lastId = 0;
        this._sendingRtpParametersByKind = data.sendingRtpParametersByKind;
        this._sendingRemoteRtpParametersByKind = data.sendingRemoteRtpParametersByKind;
    }
    send({ track, encodings, codecOptions }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
            this._stream.addTrack(track);
            this._pc.addStream(this._stream);
            let offer = yield this._pc.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });
            let localSdpObject = sdpTransform.parse(offer.sdp);
            let offerMediaObject;
            const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'server', localSdpObject });
            if (track.kind === 'video' && encodings && encodings.length > 1) {
                logger.debug('send() | enabling simulcast');
                localSdpObject = sdpTransform.parse(offer.sdp);
                offerMediaObject = localSdpObject.media
                    .find((m) => m.type === 'video');
                sdpPlanBUtils.addLegacySimulcast({
                    offerMediaObject,
                    track,
                    numStreams: encodings.length
                });
                offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
            }
            logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
            const offerDesc = new RTCSessionDescription(offer);
            yield this._pc.setLocalDescription(offerDesc);
            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
            offerMediaObject = localSdpObject.media
                .find((m) => m.type === track.kind);
            // Set RTCP CNAME.
            sendingRtpParameters.rtcp.cname =
                sdpCommonUtils.getCname({ offerMediaObject });
            // Set RTP encodings.
            sendingRtpParameters.encodings =
                sdpPlanBUtils.getRtpEncodings({ offerMediaObject, track });
            // Complete encodings with given values.
            if (encodings) {
                for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                    if (encodings[idx])
                        Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                }
            }
            // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
            // each encoding.
            if (sendingRtpParameters.encodings.length > 1 &&
                (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                    sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')) {
                for (const encoding of sendingRtpParameters.encodings) {
                    encoding.scalabilityMode = 'S1T3';
                }
            }
            this._remoteSdp.send({
                offerMediaObject,
                offerRtpParameters: sendingRtpParameters,
                answerRtpParameters: this._sendingRemoteRtpParametersByKind[track.kind],
                codecOptions
            });
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
            const answerDesc = new RTCSessionDescription(answer);
            yield this._pc.setRemoteDescription(answerDesc);
            this._lastId++;
            // Insert into the map.
            this._mapIdTrack.set(`${this._lastId}`, track);
            return { localId: `${this._lastId}`, rtpParameters: sendingRtpParameters };
        });
    }
    stopSending({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('stopSending() [localId:%s]', localId);
            const track = this._mapIdTrack.get(localId);
            if (!track)
                throw new Error('track not found');
            this._mapIdTrack.delete(localId);
            this._stream.removeTrack(track);
            this._pc.addStream(this._stream);
            const offer = yield this._pc.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });
            logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
            try {
                yield this._pc.setLocalDescription(offer);
            }
            catch (error) {
                // NOTE: If there are no sending tracks, setLocalDescription() will fail with
                // "Failed to create channels". If so, ignore it.
                if (this._stream.getTracks().length === 0) {
                    logger.warn('stopSending() | ignoring expected error due no sending tracks: %s', error.toString());
                    return;
                }
                throw error;
            }
            if (this._pc.signalingState === 'stable')
                return;
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
            const answerDesc = new RTCSessionDescription(answer);
            yield this._pc.setRemoteDescription(answerDesc);
        });
    }
    replaceTrack({ localId, track }) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    setMaxSpatialLayer({ localId, spatialLayer }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
            const track = this._mapIdTrack.get(localId);
            const rtpSender = this._pc.getSenders()
                .find((s) => s.track === track);
            if (!rtpSender)
                throw new Error('associated RTCRtpSender not found');
            const parameters = rtpSender.getParameters();
            parameters.encodings.forEach((encoding, idx) => {
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
            const track = this._mapIdTrack.get(localId);
            const rtpSender = this._pc.getSenders()
                .find((s) => s.track === track);
            if (!rtpSender)
                throw new Error('associated RTCRtpSender not found');
            const parameters = rtpSender.getParameters();
            parameters.encodings.forEach((encoding, idx) => {
                parameters.encodings[idx] = Object.assign(Object.assign({}, encoding), params);
            });
            yield rtpSender.setParameters(parameters);
        });
    }
    getSenderStats({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol, priority }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('sendDataChannel()');
            const options = {
                negotiated: true,
                id: this._nextSctpStreamId,
                ordered,
                maxPacketLifeTime,
                maxRetransmitTime: maxPacketLifeTime,
                maxRetransmits,
                protocol,
                priority
            };
            logger.debug('DataChannel options:%o', options);
            const dataChannel = this._pc.createDataChannel(label, options);
            // Increase next id.
            this._nextSctpStreamId = ++this._nextSctpStreamId % SCTP_NUM_STREAMS.MIS;
            // If this is the first DataChannel we need to create the SDP answer with
            // m=application section.
            if (!this._hasDataChannelMediaSection) {
                const offer = yield this._pc.createOffer({
                    offerToReceiveAudio: false,
                    offerToReceiveVideo: false
                });
                const localSdpObject = sdpTransform.parse(offer.sdp);
                const offerMediaObject = localSdpObject.media
                    .find((m) => m.type === 'application');
                if (!this._transportReady)
                    yield this._setupTransport({ localDtlsRole: 'server', localSdpObject });
                logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                yield this._pc.setLocalDescription(offer);
                this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                yield this._pc.setRemoteDescription(answer);
                this._hasDataChannelMediaSection = true;
            }
            const sctpStreamParameters = {
                streamId: options.id,
                ordered: options.ordered,
                maxPacketLifeTime: options.maxPacketLifeTime,
                maxRetransmits: options.maxRetransmits
            };
            return { dataChannel, sctpStreamParameters };
        });
    }
    restartIce({ iceParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('restartIce()');
            // Provide the remote SDP handler with new remote ICE parameters.
            this._remoteSdp.updateIceParameters(iceParameters);
            if (!this._transportReady)
                return;
            const offer = yield this._pc.createOffer({
                iceRestart: true,
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });
            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
            yield this._pc.setLocalDescription(offer);
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
            const answerDesc = new RTCSessionDescription(answer);
            yield this._pc.setRemoteDescription(answerDesc);
        });
    }
}
exports.SendHandler = SendHandler;
class RecvHandler extends Handler {
    constructor(data) {
        super(data);
        // Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
        // Value is an Object with mid and rtpParameters.
        this._mapIdRtpParameters = new Map();
    }
    receive({ id, kind, rtpParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('receive() [id:%s, kind:%s]', id, kind);
            const localId = id;
            const mid = kind;
            let streamId = rtpParameters.rtcp.cname;
            // NOTE: In React-Native  we cannot reuse the same remote MediaStream for new
            // remote tracks. This is because react-native-webrtc does not react on new
            // tracks generated within already existing streams, so force the streamId
            // to be different.
            logger.debug('receive() | forcing a random remote streamId to avoid well known bug in react-native-webrtc');
            streamId += `-hack-${utils.generateRandomNumber()}`;
            this._remoteSdp.receive({
                mid,
                kind,
                offerRtpParameters: rtpParameters,
                streamId,
                trackId: localId
            });
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
            const offerDesc = new RTCSessionDescription(offer);
            yield this._pc.setRemoteDescription(offerDesc);
            let answer = yield this._pc.createAnswer();
            const localSdpObject = sdpTransform.parse(answer.sdp);
            const answerMediaObject = localSdpObject.media
                .find((m) => String(m.mid) === mid);
            // May need to modify codec parameters in the answer based on codec
            // parameters in the offer.
            sdpCommonUtils.applyCodecParameters({
                offerRtpParameters: rtpParameters,
                answerMediaObject
            });
            answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'client', localSdpObject });
            logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
            const answerDesc = new RTCSessionDescription(answer);
            yield this._pc.setLocalDescription(answerDesc);
            const stream = this._pc.getRemoteStreams()
                .find((s) => s.id === streamId);
            const track = stream.getTrackById(localId);
            if (!track)
                throw new Error('remote track not found');
            // Insert into the map.
            this._mapIdRtpParameters.set(localId, { mid, rtpParameters });
            return { localId, track };
        });
    }
    stopReceiving({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('stopReceiving() [localId:%s]', localId);
            const { mid, rtpParameters } = this._mapIdRtpParameters.get(localId);
            // Remove from the map.
            this._mapIdRtpParameters.delete(localId);
            this._remoteSdp.planBStopReceiving({ mid, offerRtpParameters: rtpParameters });
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
            const offerDesc = new RTCSessionDescription(offer);
            yield this._pc.setRemoteDescription(offerDesc);
            const answer = yield this._pc.createAnswer();
            logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
            yield this._pc.setLocalDescription(answer);
        });
    }
    getReceiverStats({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new errors_1.UnsupportedError('not implemented');
        });
    }
    receiveDataChannel({ sctpStreamParameters, label, protocol }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('receiveDataChannel()');
            const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
            const options = {
                negotiated: true,
                id: streamId,
                ordered,
                maxPacketLifeTime,
                maxRetransmitTime: maxPacketLifeTime,
                maxRetransmits,
                protocol
            };
            logger.debug('DataChannel options:%o', options);
            const dataChannel = this._pc.createDataChannel(label, options);
            // If this is the first DataChannel we need to create the SDP offer with
            // m=application section.
            if (!this._hasDataChannelMediaSection) {
                this._remoteSdp.receiveSctpAssociation({ oldDataChannelSpec: true });
                const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                yield this._pc.setRemoteDescription(offer);
                const answer = yield this._pc.createAnswer();
                if (!this._transportReady) {
                    const localSdpObject = sdpTransform.parse(answer.sdp);
                    yield this._setupTransport({ localDtlsRole: 'client', localSdpObject });
                }
                logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                yield this._pc.setLocalDescription(answer);
                this._hasDataChannelMediaSection = true;
            }
            return { dataChannel };
        });
    }
    restartIce({ iceParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('restartIce()');
            // Provide the remote SDP handler with new remote ICE parameters.
            this._remoteSdp.updateIceParameters(iceParameters);
            if (!this._transportReady)
                return;
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
            const offerDesc = new RTCSessionDescription(offer);
            yield this._pc.setRemoteDescription(offerDesc);
            const answer = yield this._pc.createAnswer();
            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
            yield this._pc.setLocalDescription(answer);
        });
    }
}
class ReactNative {
    static get label() {
        return 'ReactNative';
    }
    static getNativeRtpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeRtpCapabilities()');
            const pc = new RTCPeerConnection({
                iceServers: [],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                sdpSemantics: 'plan-b'
            });
            try {
                const offer = yield pc.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                try {
                    pc.close();
                }
                catch (error) { }
                const sdpObject = sdpTransform.parse(offer.sdp);
                const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({ sdpObject });
                return nativeRtpCapabilities;
            }
            catch (error) {
                try {
                    pc.close();
                }
                catch (error2) { }
                throw error;
            }
        });
    }
    static getNativeSctpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeSctpCapabilities()');
            return {
                numStreams: SCTP_NUM_STREAMS
            };
        });
    }
    constructor({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, extendedRtpCapabilities }) {
        logger.debug('constructor() [direction:%s]', direction);
        switch (direction) {
            case 'send':
                {
                    const sendingRtpParametersByKind = {
                        audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                        video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
                    };
                    const sendingRemoteRtpParametersByKind = {
                        audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                        video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities)
                    };
                    return new SendHandler({
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        sendingRtpParametersByKind,
                        sendingRemoteRtpParametersByKind
                    });
                }
            case 'recv':
                {
                    return new RecvHandler({
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints
                    });
                }
        }
    }
}
exports.default = ReactNative;
