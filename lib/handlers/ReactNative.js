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
exports.ReactNative = void 0;
const sdpTransform = __importStar(require("sdp-transform"));
const Logger_1 = require("../Logger");
const errors_1 = require("../errors");
const utils = __importStar(require("../utils"));
const ortc = __importStar(require("../ortc"));
const sdpCommonUtils = __importStar(require("./sdp/commonUtils"));
const sdpPlanBUtils = __importStar(require("./sdp/planBUtils"));
const HandlerInterface_1 = require("./HandlerInterface");
const RemoteSdp_1 = require("./sdp/RemoteSdp");
const logger = new Logger_1.Logger('ReactNative');
const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
class ReactNative extends HandlerInterface_1.HandlerInterface {
    constructor() {
        super();
        // Local stream for sending.
        this._sendStream = new MediaStream();
        // Map of sending MediaStreamTracks indexed by localId.
        this._mapSendLocalIdTrack = new Map();
        // Next sending localId.
        this._nextSendLocalId = 0;
        // Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
        // Value is an Object with mid, rtpParameters and rtpReceiver.
        this._mapRecvLocalIdInfo = new Map();
        // Whether a DataChannel m=application section has been created.
        this._hasDataChannelMediaSection = false;
        // Sending DataChannel id value counter. Incremented for each new DataChannel.
        this._nextSendSctpStreamId = 0;
        // Got transport local and remote parameters.
        this._transportReady = false;
    }
    /**
     * Creates a factory function.
     */
    static createFactory() {
        return () => new ReactNative();
    }
    get name() {
        return 'ReactNative';
    }
    close() {
        logger.debug('close()');
        // Free/dispose native stream and tracks.
        // @ts-ignore (proprietary API in react-native-webrtc).
        this._sendStream.release();
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
            sdpSemantics: 'plan-b'
        });
        try {
            const offer = await pc.createOffer({
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
            sctpParameters,
            planB: true
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
    async updateIceServers(iceServers) {
        logger.debug('updateIceServers()');
        const configuration = this._pc.getConfiguration();
        configuration.iceServers = iceServers;
        this._pc.setConfiguration(configuration);
    }
    async restartIce(iceParameters) {
        logger.debug('restartIce()');
        // Provide the remote SDP handler with new remote ICE parameters.
        this._remoteSdp.updateIceParameters(iceParameters);
        if (!this._transportReady)
            return;
        if (this._direction === 'send') {
            const offer = await this._pc.createOffer({ iceRestart: true });
            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
            await this._pc.setLocalDescription(offer);
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
            await this._pc.setRemoteDescription(answer);
        }
        else {
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
            await this._pc.setRemoteDescription(offer);
            const answer = await this._pc.createAnswer();
            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
            await this._pc.setLocalDescription(answer);
        }
    }
    async getTransportStats() {
        return this._pc.getStats();
    }
    async send({ track, encodings, codecOptions, codec }) {
        this._assertSendDirection();
        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
        if (codec) {
            logger.warn('send() | codec selection is not available in %s handler', this.name);
        }
        this._sendStream.addTrack(track);
        this._pc.addStream(this._sendStream);
        let offer = await this._pc.createOffer();
        let localSdpObject = sdpTransform.parse(offer.sdp);
        let offerMediaObject;
        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind], {});
        sendingRtpParameters.codecs =
            ortc.reduceCodecs(sendingRtpParameters.codecs);
        const sendingRemoteRtpParameters = utils.clone(this._sendingRemoteRtpParametersByKind[track.kind], {});
        sendingRemoteRtpParameters.codecs =
            ortc.reduceCodecs(sendingRemoteRtpParameters.codecs);
        if (!this._transportReady)
            await this._setupTransport({ localDtlsRole: 'server', localSdpObject });
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
        await this._pc.setLocalDescription(offer);
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
            answerRtpParameters: sendingRemoteRtpParameters,
            codecOptions
        });
        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
        await this._pc.setRemoteDescription(answer);
        const localId = String(this._nextSendLocalId);
        this._nextSendLocalId++;
        // Insert into the map.
        this._mapSendLocalIdTrack.set(localId, track);
        return {
            localId: localId,
            rtpParameters: sendingRtpParameters
        };
    }
    async stopSending(localId) {
        this._assertSendDirection();
        logger.debug('stopSending() [localId:%s]', localId);
        const track = this._mapSendLocalIdTrack.get(localId);
        if (!track)
            throw new Error('track not found');
        this._mapSendLocalIdTrack.delete(localId);
        this._sendStream.removeTrack(track);
        this._pc.addStream(this._sendStream);
        const offer = await this._pc.createOffer();
        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
        try {
            await this._pc.setLocalDescription(offer);
        }
        catch (error) {
            // NOTE: If there are no sending tracks, setLocalDescription() will fail with
            // "Failed to create channels". If so, ignore it.
            if (this._sendStream.getTracks().length === 0) {
                logger.warn('stopSending() | ignoring expected error due no sending tracks: %s', error.toString());
                return;
            }
            throw error;
        }
        if (this._pc.signalingState === 'stable')
            return;
        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
        await this._pc.setRemoteDescription(answer);
    }
    async replaceTrack(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    localId, track) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setMaxSpatialLayer(localId, spatialLayer) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async setRtpEncodingParameters(localId, params) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getSenderStats(localId) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
        this._assertSendDirection();
        const options = {
            negotiated: true,
            id: this._nextSendSctpStreamId,
            ordered,
            maxPacketLifeTime,
            maxRetransmitTime: maxPacketLifeTime,
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
            const offer = await this._pc.createOffer();
            const localSdpObject = sdpTransform.parse(offer.sdp);
            const offerMediaObject = localSdpObject.media
                .find((m) => m.type === 'application');
            if (!this._transportReady)
                await this._setupTransport({ localDtlsRole: 'server', localSdpObject });
            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
            await this._pc.setLocalDescription(offer);
            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
            await this._pc.setRemoteDescription(answer);
            this._hasDataChannelMediaSection = true;
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
        this._assertRecvDirection();
        logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
        const localId = trackId;
        const mid = kind;
        let streamId = rtpParameters.rtcp.cname;
        // NOTE: In React-Native we cannot reuse the same remote MediaStream for new
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
            trackId
        });
        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
        await this._pc.setRemoteDescription(offer);
        let answer = await this._pc.createAnswer();
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
            await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
        await this._pc.setLocalDescription(answer);
        const stream = this._pc.getRemoteStreams()
            .find((s) => s.id === streamId);
        const track = stream.getTrackById(localId);
        if (!track)
            throw new Error('remote track not found');
        // Insert into the map.
        this._mapRecvLocalIdInfo.set(localId, { mid, rtpParameters });
        return { localId, track };
    }
    async stopReceiving(localId) {
        this._assertRecvDirection();
        logger.debug('stopReceiving() [localId:%s]', localId);
        const { mid, rtpParameters } = this._mapRecvLocalIdInfo.get(localId) || {};
        // Remove from the map.
        this._mapRecvLocalIdInfo.delete(localId);
        this._remoteSdp.planBStopReceiving({ mid: mid, offerRtpParameters: rtpParameters });
        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
        await this._pc.setRemoteDescription(offer);
        const answer = await this._pc.createAnswer();
        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
        await this._pc.setLocalDescription(answer);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getReceiverStats(localId) {
        throw new errors_1.UnsupportedError('not implemented');
    }
    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
        this._assertRecvDirection();
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
        logger.debug('receiveDataChannel() [options:%o]', options);
        const dataChannel = this._pc.createDataChannel(label, options);
        // If this is the first DataChannel we need to create the SDP offer with
        // m=application section.
        if (!this._hasDataChannelMediaSection) {
            this._remoteSdp.receiveSctpAssociation({ oldDataChannelSpec: true });
            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
            await this._pc.setRemoteDescription(offer);
            const answer = await this._pc.createAnswer();
            if (!this._transportReady) {
                const localSdpObject = sdpTransform.parse(answer.sdp);
                await this._setupTransport({ localDtlsRole: 'client', localSdpObject });
            }
            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
            await this._pc.setLocalDescription(answer);
            this._hasDataChannelMediaSection = true;
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
    _assertRecvDirection() {
        if (this._direction !== 'recv') {
            throw new Error('method can just be called for handlers with "recv" direction');
        }
    }
}
exports.ReactNative = ReactNative;
