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
const utils = __importStar(require("../utils"));
const ortc = __importStar(require("../ortc"));
const sdpCommonUtils = __importStar(require("./sdp/commonUtils"));
const sdpUnifiedPlanUtils = __importStar(require("./sdp/unifiedPlanUtils"));
const RemoteSdp_1 = __importDefault(require("./sdp/RemoteSdp"));
const scalabilityModes_1 = require("../scalabilityModes");
const logger = new Logger_1.default('Chrome70');
const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
class Handler extends EnhancedEventEmitter_1.default {
    constructor({ iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints }) {
        super(logger);
        // Got transport local and remote parameters.
        this._transportReady = false;
        // Map of RTCTransceivers indexed by MID.
        this._mapMidTransceiver = new Map();
        // Whether a DataChannel m=application section has been created.
        this._hasDataChannelMediaSection = false;
        // DataChannel id value counter. It must be incremented for each new DataChannel.
        this._nextSctpStreamId = 0;
        this._remoteSdp = new RemoteSdp_1.default({
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters
        });
        this._pc = new RTCPeerConnection(Object.assign({ iceServers: iceServers || [], iceTransportPolicy: iceTransportPolicy || 'all', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require', sdpSemantics: 'unified-plan' }, additionalSettings), proprietaryConstraints);
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
    updateIceServers({ iceServers }) {
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
        this._sendingRtpParametersByKind = data.sendingRtpParametersByKind;
        this._sendingRemoteRtpParametersByKind = data.sendingRemoteRtpParametersByKind;
    }
    send({ track, encodings, codecOptions }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
            const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
            const transceiver = this._pc.addTransceiver(track, { direction: 'sendonly', streams: [this._stream] });
            let offer = yield this._pc.createOffer();
            let localSdpObject = sdpTransform.parse(offer.sdp);
            let offerMediaObject;
            const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
            if (!this._transportReady)
                yield this._setupTransport({ localDtlsRole: 'server', localSdpObject });
            if (encodings && encodings.length > 1) {
                logger.debug('send() | enabling legacy simulcast');
                localSdpObject = sdpTransform.parse(offer.sdp);
                offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                sdpUnifiedPlanUtils.addLegacySimulcast({
                    offerMediaObject,
                    numStreams: encodings.length
                });
                offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
            }
            // Special case for VP9 with SVC.
            let hackVp9Svc = false;
            const layers = scalabilityModes_1.parse((encodings || [{}])[0].scalabilityMode);
            if (encodings &&
                encodings.length === 1 &&
                layers.spatialLayers > 1 &&
                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9') {
                logger.debug('send() | enabling legacy simulcast for VP9 SVC');
                hackVp9Svc = true;
                localSdpObject = sdpTransform.parse(offer.sdp);
                offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                sdpUnifiedPlanUtils.addLegacySimulcast({
                    offerMediaObject,
                    numStreams: layers.spatialLayers
                });
                offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
            }
            logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
            yield this._pc.setLocalDescription(offer);
            // We can now get the transceiver.mid.
            const localId = transceiver.mid;
            // Set MID.
            sendingRtpParameters.mid = localId;
            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
            offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
            // Set RTCP CNAME.
            sendingRtpParameters.rtcp.cname =
                sdpCommonUtils.getCname({ offerMediaObject });
            // Set RTP encodings.
            sendingRtpParameters.encodings =
                sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });
            // Complete encodings with given values.
            if (encodings) {
                for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                    if (encodings[idx])
                        Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                }
            }
            // Hack for VP9 SVC.
            if (hackVp9Svc)
                sendingRtpParameters.encodings = [sendingRtpParameters.encodings[0]];
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
                reuseMid: mediaSectionIdx.reuseMid,
                offerRtpParameters: sendingRtpParameters,
                answerRtpParameters: this._sendingRemoteRtpParametersByKind[track.kind],
                codecOptions
            });
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
            yield this._pc.setRemoteDescription(answer);
            // Store in the map.
            this._mapMidTransceiver.set(localId, transceiver);
            return { localId, rtpParameters: sendingRtpParameters };
        });
    }
    stopSending({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('stopSending() [localId:%s]', localId);
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            transceiver.sender.replaceTrack(null);
            this._pc.removeTrack(transceiver.sender);
            this._remoteSdp.closeMediaSection(transceiver.mid);
            const offer = yield this._pc.createOffer();
            logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
            yield this._pc.setLocalDescription(offer);
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
            yield this._pc.setRemoteDescription(answer);
        });
    }
    replaceTrack({ localId, track }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            yield transceiver.sender.replaceTrack(track);
        });
    }
    setMaxSpatialLayer({ localId, spatialLayer }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            const parameters = transceiver.sender.getParameters();
            parameters.encodings.forEach((encoding, idx) => {
                if (idx <= spatialLayer)
                    encoding.active = true;
                else
                    encoding.active = false;
            });
            yield transceiver.sender.setParameters(parameters);
        });
    }
    setRtpEncodingParameters({ localId, params }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            const parameters = transceiver.sender.getParameters();
            parameters.encodings.forEach((encoding, idx) => {
                parameters.encodings[idx] = Object.assign(Object.assign({}, encoding), params);
            });
            yield transceiver.sender.setParameters(parameters);
        });
    }
    getSenderStats({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            return transceiver.sender.getStats();
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
                const offer = yield this._pc.createOffer();
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
            const offer = yield this._pc.createOffer({ iceRestart: true });
            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
            yield this._pc.setLocalDescription(offer);
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
            yield this._pc.setRemoteDescription(answer);
        });
    }
}
class RecvHandler extends Handler {
    constructor(data) {
        super(data);
        // MID value counter. It must be converted to string and incremented for
        // each new m= section.
        this._nextMid = 0;
    }
    receive({ id, kind, rtpParameters }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('receive() [id:%s, kind:%s]', id, kind);
            const localId = String(this._nextMid);
            this._remoteSdp.receive({
                mid: localId,
                kind,
                offerRtpParameters: rtpParameters,
                streamId: rtpParameters.rtcp.cname,
                trackId: id
            });
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
            yield this._pc.setRemoteDescription(offer);
            let answer = yield this._pc.createAnswer();
            const localSdpObject = sdpTransform.parse(answer.sdp);
            const answerMediaObject = localSdpObject.media
                .find((m) => String(m.mid) === localId);
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
            yield this._pc.setLocalDescription(answer);
            const transceiver = this._pc.getTransceivers()
                .find((t) => t.mid === localId);
            if (!transceiver)
                throw new Error('new RTCRtpTransceiver not found');
            // Store in the map.
            this._mapMidTransceiver.set(localId, transceiver);
            // Increase next MID.
            this._nextMid++;
            return { localId, track: transceiver.receiver.track };
        });
    }
    stopReceiving({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('stopReceiving() [localId:%s]', localId);
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            this._remoteSdp.closeMediaSection(transceiver.mid);
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
            yield this._pc.setRemoteDescription(offer);
            const answer = yield this._pc.createAnswer();
            logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
            yield this._pc.setLocalDescription(answer);
        });
    }
    getReceiverStats({ localId }) {
        return __awaiter(this, void 0, void 0, function* () {
            const transceiver = this._mapMidTransceiver.get(localId);
            if (!transceiver)
                throw new Error('associated RTCRtpTransceiver not found');
            return transceiver.receiver.getStats();
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
                this._remoteSdp.receiveSctpAssociation();
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
            yield this._pc.setRemoteDescription(offer);
            const answer = yield this._pc.createAnswer();
            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
            yield this._pc.setLocalDescription(answer);
        });
    }
}
class Chrome70 {
    static get label() {
        return 'Chrome70';
    }
    static getNativeRtpCapabilities() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getNativeRtpCapabilities()');
            const pc = new RTCPeerConnection({
                iceServers: [],
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                sdpSemantics: 'unified-plan'
            });
            try {
                pc.addTransceiver('audio');
                pc.addTransceiver('video');
                const offer = yield pc.createOffer();
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
exports.default = Chrome70;
