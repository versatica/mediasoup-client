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
exports.OfferMediaSection = exports.AnswerMediaSection = exports.MediaSection = void 0;
const utils = __importStar(require("../../utils"));
class MediaSection {
    constructor({ iceParameters, iceCandidates, dtlsParameters, planB = false }) {
        this._mediaObject = {};
        this._planB = planB;
        if (iceParameters) {
            this.setIceParameters(iceParameters);
        }
        if (iceCandidates) {
            this._mediaObject.candidates = [];
            for (const candidate of iceCandidates) {
                const candidateObject = {};
                // mediasoup does mandates rtcp-mux so candidates component is always
                // RTP (1).
                candidateObject.component = 1;
                candidateObject.foundation = candidate.foundation;
                candidateObject.ip = candidate.ip;
                candidateObject.port = candidate.port;
                candidateObject.priority = candidate.priority;
                candidateObject.transport = candidate.protocol;
                candidateObject.type = candidate.type;
                if (candidate.tcpType)
                    candidateObject.tcptype = candidate.tcpType;
                this._mediaObject.candidates.push(candidateObject);
            }
            this._mediaObject.endOfCandidates = 'end-of-candidates';
            this._mediaObject.iceOptions = 'renomination';
        }
        if (dtlsParameters) {
            this.setDtlsRole(dtlsParameters.role);
        }
    }
    get mid() {
        return String(this._mediaObject.mid);
    }
    get closed() {
        return this._mediaObject.port === 0;
    }
    getObject() {
        return this._mediaObject;
    }
    setIceParameters(iceParameters) {
        this._mediaObject.iceUfrag = iceParameters.usernameFragment;
        this._mediaObject.icePwd = iceParameters.password;
    }
    disable() {
        this._mediaObject.direction = 'inactive';
        delete this._mediaObject.ext;
        delete this._mediaObject.ssrcs;
        delete this._mediaObject.ssrcGroups;
        delete this._mediaObject.simulcast;
        delete this._mediaObject.simulcast_03;
        delete this._mediaObject.rids;
    }
    close() {
        this._mediaObject.direction = 'inactive';
        this._mediaObject.port = 0;
        delete this._mediaObject.ext;
        delete this._mediaObject.ssrcs;
        delete this._mediaObject.ssrcGroups;
        delete this._mediaObject.simulcast;
        delete this._mediaObject.simulcast_03;
        delete this._mediaObject.rids;
        delete this._mediaObject.extmapAllowMixed;
    }
}
exports.MediaSection = MediaSection;
class AnswerMediaSection extends MediaSection {
    constructor({ iceParameters, iceCandidates, dtlsParameters, sctpParameters, plainRtpParameters, planB = false, offerMediaObject, offerRtpParameters, answerRtpParameters, codecOptions, extmapAllowMixed = false }) {
        super({ iceParameters, iceCandidates, dtlsParameters, planB });
        this._mediaObject.mid = String(offerMediaObject.mid);
        this._mediaObject.type = offerMediaObject.type;
        this._mediaObject.protocol = offerMediaObject.protocol;
        if (!plainRtpParameters) {
            this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
            this._mediaObject.port = 7;
        }
        else {
            this._mediaObject.connection =
                {
                    ip: plainRtpParameters.ip,
                    version: plainRtpParameters.ipVersion
                };
            this._mediaObject.port = plainRtpParameters.port;
        }
        switch (offerMediaObject.type) {
            case 'audio':
            case 'video':
                {
                    this._mediaObject.direction = 'recvonly';
                    this._mediaObject.rtp = [];
                    this._mediaObject.rtcpFb = [];
                    this._mediaObject.fmtp = [];
                    for (const codec of answerRtpParameters.codecs) {
                        const rtp = {
                            payload: codec.payloadType,
                            codec: getCodecName(codec),
                            rate: codec.clockRate
                        };
                        if (codec.channels > 1)
                            rtp.encoding = codec.channels;
                        this._mediaObject.rtp.push(rtp);
                        const codecParameters = utils.clone(codec.parameters, {});
                        if (codecOptions) {
                            const { opusStereo, opusFec, opusDtx, opusMaxPlaybackRate, opusMaxAverageBitrate, opusPtime, videoGoogleStartBitrate, videoGoogleMaxBitrate, videoGoogleMinBitrate } = codecOptions;
                            const offerCodec = offerRtpParameters.codecs
                                .find((c) => (c.payloadType === codec.payloadType));
                            switch (codec.mimeType.toLowerCase()) {
                                case 'audio/opus':
                                    {
                                        if (opusStereo !== undefined) {
                                            offerCodec.parameters['sprop-stereo'] = opusStereo ? 1 : 0;
                                            codecParameters.stereo = opusStereo ? 1 : 0;
                                        }
                                        if (opusFec !== undefined) {
                                            offerCodec.parameters.useinbandfec = opusFec ? 1 : 0;
                                            codecParameters.useinbandfec = opusFec ? 1 : 0;
                                        }
                                        if (opusDtx !== undefined) {
                                            offerCodec.parameters.usedtx = opusDtx ? 1 : 0;
                                            codecParameters.usedtx = opusDtx ? 1 : 0;
                                        }
                                        if (opusMaxPlaybackRate !== undefined) {
                                            codecParameters.maxplaybackrate = opusMaxPlaybackRate;
                                        }
                                        if (opusMaxAverageBitrate !== undefined) {
                                            codecParameters.maxaveragebitrate = opusMaxAverageBitrate;
                                        }
                                        if (opusPtime !== undefined) {
                                            offerCodec.parameters.ptime = opusPtime;
                                            codecParameters.ptime = opusPtime;
                                        }
                                        break;
                                    }
                                case 'video/vp8':
                                case 'video/vp9':
                                case 'video/h264':
                                case 'video/h265':
                                    {
                                        if (videoGoogleStartBitrate !== undefined)
                                            codecParameters['x-google-start-bitrate'] = videoGoogleStartBitrate;
                                        if (videoGoogleMaxBitrate !== undefined)
                                            codecParameters['x-google-max-bitrate'] = videoGoogleMaxBitrate;
                                        if (videoGoogleMinBitrate !== undefined)
                                            codecParameters['x-google-min-bitrate'] = videoGoogleMinBitrate;
                                        break;
                                    }
                            }
                        }
                        const fmtp = {
                            payload: codec.payloadType,
                            config: ''
                        };
                        for (const key of Object.keys(codecParameters)) {
                            if (fmtp.config)
                                fmtp.config += ';';
                            fmtp.config += `${key}=${codecParameters[key]}`;
                        }
                        if (fmtp.config)
                            this._mediaObject.fmtp.push(fmtp);
                        for (const fb of codec.rtcpFeedback) {
                            this._mediaObject.rtcpFb.push({
                                payload: codec.payloadType,
                                type: fb.type,
                                subtype: fb.parameter
                            });
                        }
                    }
                    this._mediaObject.payloads = answerRtpParameters.codecs
                        .map((codec) => codec.payloadType)
                        .join(' ');
                    this._mediaObject.ext = [];
                    for (const ext of answerRtpParameters.headerExtensions) {
                        // Don't add a header extension if not present in the offer.
                        const found = (offerMediaObject.ext || [])
                            .some((localExt) => localExt.uri === ext.uri);
                        if (!found)
                            continue;
                        this._mediaObject.ext.push({
                            uri: ext.uri,
                            value: ext.id
                        });
                    }
                    // Allow both 1 byte and 2 bytes length header extensions.
                    if (extmapAllowMixed &&
                        offerMediaObject.extmapAllowMixed === 'extmap-allow-mixed') {
                        this._mediaObject.extmapAllowMixed = 'extmap-allow-mixed';
                    }
                    // Simulcast.
                    if (offerMediaObject.simulcast) {
                        this._mediaObject.simulcast =
                            {
                                dir1: 'recv',
                                list1: offerMediaObject.simulcast.list1
                            };
                        this._mediaObject.rids = [];
                        for (const rid of offerMediaObject.rids || []) {
                            if (rid.direction !== 'send')
                                continue;
                            this._mediaObject.rids.push({
                                id: rid.id,
                                direction: 'recv'
                            });
                        }
                    }
                    // Simulcast (draft version 03).
                    else if (offerMediaObject.simulcast_03) {
                        // eslint-disable-next-line camelcase
                        this._mediaObject.simulcast_03 =
                            {
                                value: offerMediaObject.simulcast_03.value.replace(/send/g, 'recv')
                            };
                        this._mediaObject.rids = [];
                        for (const rid of offerMediaObject.rids || []) {
                            if (rid.direction !== 'send')
                                continue;
                            this._mediaObject.rids.push({
                                id: rid.id,
                                direction: 'recv'
                            });
                        }
                    }
                    this._mediaObject.rtcpMux = 'rtcp-mux';
                    this._mediaObject.rtcpRsize = 'rtcp-rsize';
                    if (this._planB && this._mediaObject.type === 'video')
                        this._mediaObject.xGoogleFlag = 'conference';
                    break;
                }
            case 'application':
                {
                    // New spec.
                    if (typeof offerMediaObject.sctpPort === 'number') {
                        this._mediaObject.payloads = 'webrtc-datachannel';
                        this._mediaObject.sctpPort = sctpParameters.port;
                        this._mediaObject.maxMessageSize = sctpParameters.maxMessageSize;
                    }
                    // Old spec.
                    else if (offerMediaObject.sctpmap) {
                        this._mediaObject.payloads = sctpParameters.port;
                        this._mediaObject.sctpmap =
                            {
                                app: 'webrtc-datachannel',
                                sctpmapNumber: sctpParameters.port,
                                maxMessageSize: sctpParameters.maxMessageSize
                            };
                    }
                    break;
                }
        }
    }
    setDtlsRole(role) {
        switch (role) {
            case 'client':
                this._mediaObject.setup = 'active';
                break;
            case 'server':
                this._mediaObject.setup = 'passive';
                break;
            case 'auto':
                this._mediaObject.setup = 'actpass';
                break;
        }
    }
}
exports.AnswerMediaSection = AnswerMediaSection;
class OfferMediaSection extends MediaSection {
    constructor({ iceParameters, iceCandidates, dtlsParameters, sctpParameters, plainRtpParameters, planB = false, mid, kind, offerRtpParameters, streamId, trackId, oldDataChannelSpec = false }) {
        super({ iceParameters, iceCandidates, dtlsParameters, planB });
        this._mediaObject.mid = String(mid);
        this._mediaObject.type = kind;
        if (!plainRtpParameters) {
            this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
            if (!sctpParameters)
                this._mediaObject.protocol = 'UDP/TLS/RTP/SAVPF';
            else
                this._mediaObject.protocol = 'UDP/DTLS/SCTP';
            this._mediaObject.port = 7;
        }
        else {
            this._mediaObject.connection =
                {
                    ip: plainRtpParameters.ip,
                    version: plainRtpParameters.ipVersion
                };
            this._mediaObject.protocol = 'RTP/AVP';
            this._mediaObject.port = plainRtpParameters.port;
        }
        switch (kind) {
            case 'audio':
            case 'video':
                {
                    this._mediaObject.direction = 'sendonly';
                    this._mediaObject.rtp = [];
                    this._mediaObject.rtcpFb = [];
                    this._mediaObject.fmtp = [];
                    if (!this._planB)
                        this._mediaObject.msid = `${streamId || '-'} ${trackId}`;
                    for (const codec of offerRtpParameters.codecs) {
                        const rtp = {
                            payload: codec.payloadType,
                            codec: getCodecName(codec),
                            rate: codec.clockRate
                        };
                        if (codec.channels > 1)
                            rtp.encoding = codec.channels;
                        this._mediaObject.rtp.push(rtp);
                        const fmtp = {
                            payload: codec.payloadType,
                            config: ''
                        };
                        for (const key of Object.keys(codec.parameters)) {
                            if (fmtp.config)
                                fmtp.config += ';';
                            fmtp.config += `${key}=${codec.parameters[key]}`;
                        }
                        if (fmtp.config)
                            this._mediaObject.fmtp.push(fmtp);
                        for (const fb of codec.rtcpFeedback) {
                            this._mediaObject.rtcpFb.push({
                                payload: codec.payloadType,
                                type: fb.type,
                                subtype: fb.parameter
                            });
                        }
                    }
                    this._mediaObject.payloads = offerRtpParameters.codecs
                        .map((codec) => codec.payloadType)
                        .join(' ');
                    this._mediaObject.ext = [];
                    for (const ext of offerRtpParameters.headerExtensions) {
                        this._mediaObject.ext.push({
                            uri: ext.uri,
                            value: ext.id
                        });
                    }
                    this._mediaObject.rtcpMux = 'rtcp-mux';
                    this._mediaObject.rtcpRsize = 'rtcp-rsize';
                    const encoding = offerRtpParameters.encodings[0];
                    const ssrc = encoding.ssrc;
                    const rtxSsrc = (encoding.rtx && encoding.rtx.ssrc)
                        ? encoding.rtx.ssrc
                        : undefined;
                    this._mediaObject.ssrcs = [];
                    this._mediaObject.ssrcGroups = [];
                    if (offerRtpParameters.rtcp.cname) {
                        this._mediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'cname',
                            value: offerRtpParameters.rtcp.cname
                        });
                    }
                    if (this._planB) {
                        this._mediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'msid',
                            value: `${streamId || '-'} ${trackId}`
                        });
                    }
                    if (rtxSsrc) {
                        if (offerRtpParameters.rtcp.cname) {
                            this._mediaObject.ssrcs.push({
                                id: rtxSsrc,
                                attribute: 'cname',
                                value: offerRtpParameters.rtcp.cname
                            });
                        }
                        if (this._planB) {
                            this._mediaObject.ssrcs.push({
                                id: rtxSsrc,
                                attribute: 'msid',
                                value: `${streamId || '-'} ${trackId}`
                            });
                        }
                        // Associate original and retransmission SSRCs.
                        this._mediaObject.ssrcGroups.push({
                            semantics: 'FID',
                            ssrcs: `${ssrc} ${rtxSsrc}`
                        });
                    }
                    break;
                }
            case 'application':
                {
                    // New spec.
                    if (!oldDataChannelSpec) {
                        this._mediaObject.payloads = 'webrtc-datachannel';
                        this._mediaObject.sctpPort = sctpParameters.port;
                        this._mediaObject.maxMessageSize = sctpParameters.maxMessageSize;
                    }
                    // Old spec.
                    else {
                        this._mediaObject.payloads = sctpParameters.port;
                        this._mediaObject.sctpmap =
                            {
                                app: 'webrtc-datachannel',
                                sctpmapNumber: sctpParameters.port,
                                maxMessageSize: sctpParameters.maxMessageSize
                            };
                    }
                    break;
                }
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setDtlsRole(role) {
        // Always 'actpass'.
        this._mediaObject.setup = 'actpass';
    }
    planBReceive({ offerRtpParameters, streamId, trackId }) {
        const encoding = offerRtpParameters.encodings[0];
        const ssrc = encoding.ssrc;
        const rtxSsrc = (encoding.rtx && encoding.rtx.ssrc)
            ? encoding.rtx.ssrc
            : undefined;
        const payloads = this._mediaObject.payloads.split(' ');
        for (const codec of offerRtpParameters.codecs) {
            if (payloads.includes(String(codec.payloadType))) {
                continue;
            }
            const rtp = {
                payload: codec.payloadType,
                codec: getCodecName(codec),
                rate: codec.clockRate
            };
            if (codec.channels > 1)
                rtp.encoding = codec.channels;
            this._mediaObject.rtp.push(rtp);
            const fmtp = {
                payload: codec.payloadType,
                config: ''
            };
            for (const key of Object.keys(codec.parameters)) {
                if (fmtp.config)
                    fmtp.config += ';';
                fmtp.config += `${key}=${codec.parameters[key]}`;
            }
            if (fmtp.config)
                this._mediaObject.fmtp.push(fmtp);
            for (const fb of codec.rtcpFeedback) {
                this._mediaObject.rtcpFb.push({
                    payload: codec.payloadType,
                    type: fb.type,
                    subtype: fb.parameter
                });
            }
        }
        this._mediaObject.payloads += ` ${offerRtpParameters
            .codecs
            .filter((codec) => !this._mediaObject.payloads.includes(codec.payloadType))
            .map((codec) => codec.payloadType)
            .join(' ')}`;
        this._mediaObject.payloads = this._mediaObject.payloads.trim();
        if (offerRtpParameters.rtcp.cname) {
            this._mediaObject.ssrcs.push({
                id: ssrc,
                attribute: 'cname',
                value: offerRtpParameters.rtcp.cname
            });
        }
        this._mediaObject.ssrcs.push({
            id: ssrc,
            attribute: 'msid',
            value: `${streamId || '-'} ${trackId}`
        });
        if (rtxSsrc) {
            if (offerRtpParameters.rtcp.cname) {
                this._mediaObject.ssrcs.push({
                    id: rtxSsrc,
                    attribute: 'cname',
                    value: offerRtpParameters.rtcp.cname
                });
            }
            this._mediaObject.ssrcs.push({
                id: rtxSsrc,
                attribute: 'msid',
                value: `${streamId || '-'} ${trackId}`
            });
            // Associate original and retransmission SSRCs.
            this._mediaObject.ssrcGroups.push({
                semantics: 'FID',
                ssrcs: `${ssrc} ${rtxSsrc}`
            });
        }
    }
    planBStopReceiving({ offerRtpParameters }) {
        const encoding = offerRtpParameters.encodings[0];
        const ssrc = encoding.ssrc;
        const rtxSsrc = (encoding.rtx && encoding.rtx.ssrc)
            ? encoding.rtx.ssrc
            : undefined;
        this._mediaObject.ssrcs = this._mediaObject.ssrcs
            .filter((s) => s.id !== ssrc && s.id !== rtxSsrc);
        if (rtxSsrc) {
            this._mediaObject.ssrcGroups = this._mediaObject.ssrcGroups
                .filter((group) => group.ssrcs !== `${ssrc} ${rtxSsrc}`);
        }
    }
}
exports.OfferMediaSection = OfferMediaSection;
function getCodecName(codec) {
    const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');
    const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);
    if (!mimeTypeMatch)
        throw new TypeError('invalid codec.mimeType');
    return mimeTypeMatch[2];
}
