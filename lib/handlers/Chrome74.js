"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chrome74 = void 0;
const sdpTransform = __importStar(require("sdp-transform"));
const Logger_1 = require("../Logger");
const utils = __importStar(require("../utils"));
const ortc = __importStar(require("../ortc"));
const sdpCommonUtils = __importStar(require("./sdp/commonUtils"));
const sdpUnifiedPlanUtils = __importStar(require("./sdp/unifiedPlanUtils"));
const HandlerInterface_1 = require("./HandlerInterface");
const RemoteSdp_1 = require("./sdp/RemoteSdp");
const scalabilityModes_1 = require("../scalabilityModes");
const logger = new Logger_1.Logger('Chrome74');
const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
class Chrome74 extends HandlerInterface_1.HandlerInterface {
    constructor() {
        super();
        // Map of RTCTransceivers indexed by MID.
        this._mapMidTransceiver = new Map();
        // Local stream for sending.
        this._sendStream = new MediaStream();
        // Whether a DataChannel m=application section has been created.
        this._hasDataChannelMediaSection = false;
        // Sending DataChannel id value counter. Incremented for each new DataChannel.
        this._nextSendSctpStreamId = 0;
        // Got transport local and remote parameters.
        this._transportReady = false;
        // Promise to wait for a renegotiation already in progress.
        this._negotiationInProgress = null;
        // List of callbacks for all the queued renegotiations while another one is in progress.
        this._negotiationsQueued = [];
    }
    /**
     * Creates a factory function.
     */
    static createFactory() {
        return () => new Chrome74();
    }
    get name() {
        return 'Chrome74';
    }
    get concurrentOperationsSupported() {
        return true;
    }
    close() {
        logger.debug('close()');
        // Close RTCPeerConnection.
        if (this._pc) {
            try {
                this._pc.close();
            }
            catch (error) { }
        }
    }
    async getNativeRtpCapabilities() {
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
            const offer = await pc.createOffer();
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
    }
    async getNativeSctpCapabilities() {
        logger.debug('getNativeSctpCapabilities()');
        return {
            numStreams: SCTP_NUM_STREAMS
        };
    }
    run({ direction, iceParameters, iceCandidates, dtlsParameters, sctpParameters, iceServers, iceTransportPolicy, additionalSettings, proprietaryConstraints, extendedRtpCapabilities }) {
        logger.debug('run()');
        this._direction = direction;
        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters
        });
        this._sendingRtpParametersByKind =
            {
                audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
            };
        this._sendingRemoteRtpParametersByKind =
            {
                audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities)
            };
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
    async updateIceServers(iceServers) {
        logger.debug('updateIceServers()');
        const configuration = this._pc.getConfiguration();
        configuration.iceServers = iceServers;
        this._pc.setConfiguration(configuration);
    }
    async renegotiateSend(offerCallback, setLocalDescriptionCallback) {
        this._negotiationsQueued.push({ offerCallback, setLocalDescriptionCallback });
        if (this._negotiationInProgress) {
            logger.debug('renegotiateSend() | queued while another one is in progress');
            await this._negotiationInProgress;
        }
        if (!this._negotiationInProgress) {
            const negotiationsQueued = this._negotiationsQueued;
            this._negotiationsQueued = [];
            let resolve;
            let reject;
            this._negotiationInProgress = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            logger.debug('renegotiateSend() | performing negotiation for queued %d items', negotiationsQueued.length);
            let error;
            try {
                let offer = await this._pc.createOffer({ iceRestart: true });
                const localSdpObject = sdpTransform.parse(offer.sdp);
                if (!this._transportReady)
                    await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
                negotiationsQueued.forEach((item) => {
                    if (item.offerCallback) {
                        item.offerCallback(localSdpObject);
                    }
                });
                offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                logger.debug('renegotiateSend() | calling pc.setLocalDescription() [offer:%o]', offer);
                await this._pc.setLocalDescription(offer);
                negotiationsQueued.forEach((item) => {
                    if (item.setLocalDescriptionCallback) {
                        item.setLocalDescriptionCallback(localSdpObject);
                    }
                });
                const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                logger.debug('renegotiateSend() | calling pc.setRemoteDescription() [answer:%o]', answer);
                await this._pc.setRemoteDescription(answer);
            }
            catch (err) {
                error = err;
            }
            finally {
                this._negotiationInProgress = null;
                if (error)
                    reject === null || reject === void 0 ? void 0 : reject.call(this, error);
                else
                    resolve === null || resolve === void 0 ? void 0 : resolve.call(this);
            }
        }
        else {
            await this._negotiationInProgress;
        }
    }
    async renegotiateReceive(answerCallback) {
        this._negotiationsQueued.push({ answerCallback });
        if (this._negotiationInProgress) {
            logger.debug('renegotiateReceive() | queued while another one is in progress');
            await this._negotiationInProgress;
        }
        if (!this._negotiationInProgress) {
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            const negotiationsQueued = this._negotiationsQueued;
            this._negotiationsQueued = [];
            let resolve;
            let reject;
            this._negotiationInProgress = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            logger.debug('renegotiateReceive() | performing negotiation for queued %d items', negotiationsQueued.length);
            let error;
            try {
                logger.debug('renegotiateReceive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                await this._pc.setRemoteDescription(offer);
                let answer = await this._pc.createAnswer();
                const localSdpObject = sdpTransform.parse(answer.sdp);
                if (!this._transportReady)
                    await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
                negotiationsQueued.forEach((item) => {
                    if (item.answerCallback) {
                        item.answerCallback(localSdpObject);
                    }
                });
                answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                logger.debug('renegotiateReceive() | calling pc.setLocalDescription() [answer:%o]', answer);
                await this._pc.setLocalDescription(answer);
            }
            catch (err) {
                error = err;
            }
            finally {
                this._negotiationInProgress = null;
                if (error)
                    reject === null || reject === void 0 ? void 0 : reject.call(this, error);
                else
                    resolve === null || resolve === void 0 ? void 0 : resolve.call(this);
            }
        }
        else {
            await this._negotiationInProgress;
        }
    }
    async restartIce(iceParameters) {
        logger.debug('restartIce()');
        // Provide the remote SDP handler with new remote ICE parameters.
        this._remoteSdp.updateIceParameters(iceParameters);
        if (!this._transportReady)
            return;
        if (this._direction === 'send') {
            await this.renegotiateSend();
        }
        else {
            await this.renegotiateReceive();
        }
    }
    async getTransportStats() {
        return this._pc.getStats();
    }
    async send({ track, encodings, codecOptions, codec }) {
        this._assertSendDirection();
        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
        if (encodings && encodings.length > 1) {
            encodings.forEach((encoding, idx) => {
                encoding.rid = `r${idx}`;
            });
        }
        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind], {});
        // This may throw.
        sendingRtpParameters.codecs =
            ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
        const sendingRemoteRtpParameters = utils.clone(this._sendingRemoteRtpParametersByKind[track.kind], {});
        // This may throw.
        sendingRemoteRtpParameters.codecs =
            ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
        const transceiver = this._pc.addTransceiver(track, {
            direction: 'sendonly',
            streams: [this._sendStream],
            sendEncodings: encodings
        });
        // Special case for VP9 with SVC.
        let hackVp9Svc = false;
        await this.renegotiateSend((localSdpObject) => {
            logger.debug('send() | before setting local description');
            const layers = scalabilityModes_1.parse((encodings || [{}])[0].scalabilityMode);
            if (encodings &&
                encodings.length === 1 &&
                layers.spatialLayers > 1 &&
                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9') {
                logger.debug('send() | enabling legacy simulcast for VP9 SVC');
                hackVp9Svc = true;
                // Find media section by trackId.  The limitation is that we dont' support
                // publishing the same track twice in parallel when using hack vp9 svc mode.
                const offerMediaObject = localSdpObject.media.find((m) => { var _a; return (_a = m.msid) === null || _a === void 0 ? void 0 : _a.endsWith(track.id); });
                sdpUnifiedPlanUtils.addLegacySimulcast({
                    offerMediaObject,
                    numStreams: layers.spatialLayers
                });
            }
        }, () => {
            logger.debug('send() | after setting local description [mid=%s]', transceiver.mid);
            const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
            // We can now get the transceiver.mid.
            const localId = transceiver.mid;
            // Store in the map.
            this._mapMidTransceiver.set(localId, transceiver);
            // Set MID.
            sendingRtpParameters.mid = localId;
            const localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
            const offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
            // Set RTCP CNAME.
            sendingRtpParameters.rtcp.cname =
                sdpCommonUtils.getCname({ offerMediaObject });
            // Set RTP encodings by parsing the SDP offer if no encodings are given.
            if (!encodings) {
                sendingRtpParameters.encodings =
                    sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });
            }
            // Set RTP encodings by parsing the SDP offer and complete them with given
            // one if just a single encoding has been given.
            else if (encodings.length === 1) {
                let newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({ offerMediaObject });
                Object.assign(newEncodings[0], encodings[0]);
                // Hack for VP9 SVC.
                if (hackVp9Svc)
                    newEncodings = [newEncodings[0]];
                sendingRtpParameters.encodings = newEncodings;
            }
            // Otherwise if more than 1 encoding are given use them verbatim.
            else {
                sendingRtpParameters.encodings = encodings;
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
            logger.debug('send() | modifiying remote sdp [%o]', offerMediaObject);
            this._remoteSdp.send({
                offerMediaObject,
                reuseMid: mediaSectionIdx.reuseMid,
                offerRtpParameters: sendingRtpParameters,
                answerRtpParameters: sendingRemoteRtpParameters,
                codecOptions,
                extmapAllowMixed: true
            });
        });
        return {
            localId: transceiver.mid,
            rtpParameters: sendingRtpParameters,
            rtpSender: transceiver.sender
        };
    }
    async stopSending(localId) {
        this._assertSendDirection();
        logger.debug('stopSending() [localId:%s]', localId);
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        transceiver.sender.replaceTrack(null);
        this._pc.removeTrack(transceiver.sender);
        this._remoteSdp.closeMediaSection(transceiver.mid);
        this.renegotiateSend();
    }
    async replaceTrack(localId, track) {
        this._assertSendDirection();
        if (track) {
            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
        }
        else {
            logger.debug('replaceTrack() [localId:%s, no track]', localId);
        }
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        await transceiver.sender.replaceTrack(track);
    }
    async setMaxSpatialLayer(localId, spatialLayer) {
        this._assertSendDirection();
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
        await transceiver.sender.setParameters(parameters);
    }
    async setRtpEncodingParameters(localId, params) {
        this._assertSendDirection();
        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        const parameters = transceiver.sender.getParameters();
        parameters.encodings.forEach((encoding, idx) => {
            parameters.encodings[idx] = Object.assign(Object.assign({}, encoding), params);
        });
        await transceiver.sender.setParameters(parameters);
    }
    async getSenderStats(localId) {
        this._assertSendDirection();
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        return transceiver.sender.getStats();
    }
    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
        this._assertSendDirection();
        const options = {
            negotiated: true,
            id: this._nextSendSctpStreamId,
            ordered,
            maxPacketLifeTime,
            maxRetransmits,
            protocol
        };
        logger.debug('sendDataChannel() [options:%o]', options);
        const dataChannel = this._pc.createDataChannel(label, options);
        // Increase next id.
        this._nextSendSctpStreamId =
            ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
        // If this is the first DataChannel we need to create the SDP answer with
        // m=application section.
        if (!this._hasDataChannelMediaSection) {
            await this.renegotiateSend((localSdpObject) => {
                if (!this._hasDataChannelMediaSection) {
                    const offerMediaObject = localSdpObject.media
                        .find((m) => m.type === 'application');
                    this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                    this._hasDataChannelMediaSection = true;
                }
            });
        }
        const sctpStreamParameters = {
            streamId: options.id,
            ordered: options.ordered,
            maxPacketLifeTime: options.maxPacketLifeTime,
            maxRetransmits: options.maxRetransmits
        };
        return { dataChannel, sctpStreamParameters };
    }
    async receive({ trackId, kind, rtpParameters }) {
        this._assertReceiveDirection();
        const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
        // Store in the map without a transceiver while in progress so that we
        // can keep using "this._mapMidTransceiver.size" to assign localIds.
        this._mapMidTransceiver.set(localId, null);
        this._remoteSdp.receive({
            mid: localId,
            kind,
            offerRtpParameters: rtpParameters,
            streamId: rtpParameters.rtcp.cname,
            trackId
        });
        await this.renegotiateReceive((localSdpObject) => {
            logger.debug('receive() | before setting local description');
            const answerMediaObject = localSdpObject.media
                .find((m) => String(m.mid) === localId);
            sdpCommonUtils.applyCodecParameters({
                offerRtpParameters: rtpParameters,
                answerMediaObject
            });
        });
        const transceiver = this._pc.getTransceivers()
            .find((t) => t.mid === localId);
        if (!transceiver) {
            throw new Error('new RTCRtpTransceiver not found');
        }
        // Store in the map.
        this._mapMidTransceiver.set(localId, transceiver);
        return {
            localId,
            track: transceiver.receiver.track,
            rtpReceiver: transceiver.receiver
        };
    }
    async stopReceiving(localId) {
        this._assertReceiveDirection();
        logger.debug('stopReceiving() [localId:%s]', localId);
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        this._remoteSdp.closeMediaSection(transceiver.mid);
        await this.renegotiateReceive();
    }
    async pauseReceiving(localId) {
        this._assertReceiveDirection();
        logger.debug('pauseReceiving() [localId:%s]', localId);
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        transceiver.direction = 'inactive';
        this.renegotiateReceive();
    }
    async resumeReceiving(localId) {
        this._assertReceiveDirection();
        logger.debug('resumeReceiving() [localId:%s]', localId);
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        transceiver.direction = 'recvonly';
        this.renegotiateReceive();
    }
    async getReceiverStats(localId) {
        this._assertReceiveDirection();
        const transceiver = this._mapMidTransceiver.get(localId);
        if (!transceiver)
            throw new Error('associated RTCRtpTransceiver not found');
        return transceiver.receiver.getStats();
    }
    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
        this._assertReceiveDirection();
        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
        const options = {
            negotiated: true,
            id: streamId,
            ordered,
            maxPacketLifeTime,
            maxRetransmits,
            protocol
        };
        logger.debug('receiveDataChannel() [options:%o]', options);
        const dataChannel = this._pc.createDataChannel(label, options);
        // If this is the first DataChannel we need to create the SDP offer with
        // m=application section.
        if (!this._hasDataChannelMediaSection) {
            this._remoteSdp.receiveSctpAssociation();
            this._hasDataChannelMediaSection = true;
            await this.renegotiateReceive();
        }
        return { dataChannel };
    }
    async _setupTransport({ localDtlsRole, localSdpObject }) {
        if (!localSdpObject)
            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
        // Get our local DTLS parameters.
        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({ sdpObject: localSdpObject });
        // Set our DTLS role.
        dtlsParameters.role = localDtlsRole;
        // Update the remote DTLS role in the SDP.
        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
        // Need to tell the remote transport about our parameters.
        await this.safeEmitAsPromise('@connect', { dtlsParameters });
        this._transportReady = true;
    }
    _assertSendDirection() {
        if (this._direction !== 'send') {
            throw new Error('method can just be called for handlers with "send" direction');
        }
    }
    _assertReceiveDirection() {
        if (this._direction !== 'recv') {
            throw new Error('method can just be called for handlers with "recv" direction');
        }
    }
}
exports.Chrome74 = Chrome74;
