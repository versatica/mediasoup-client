"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdpTransform = require("sdp-transform");
function extractRtpCapabilities({ sdpObject }) {
    // Map of RtpCodecParameters indexed by payload type.
    const codecsMap = new Map();
    // Array of RtpHeaderExtensions.
    const headerExtensions = [];
    // Whether a m=audio/video section has been already found.
    let gotAudio = false;
    let gotVideo = false;
    for (const m of sdpObject.media) {
        const kind = m.type;
        switch (kind) {
            case 'audio':
                {
                    if (gotAudio)
                        continue;
                    gotAudio = true;
                    break;
                }
            case 'video':
                {
                    if (gotVideo)
                        continue;
                    gotVideo = true;
                    break;
                }
            default:
                {
                    continue;
                }
        }
        // Get codecs.
        for (const rtp of m.rtp) {
            const codec = {
                kind: kind,
                mimeType: `${kind}/${rtp.codec}`,
                preferredPayloadType: rtp.payload,
                clockRate: rtp.rate,
                channels: rtp.encoding,
                parameters: {},
                rtcpFeedback: []
            };
            codecsMap.set(codec.preferredPayloadType, codec);
        }
        // Get codec parameters.
        for (const fmtp of m.fmtp || []) {
            const parameters = sdpTransform.parseParams(fmtp.config);
            const codec = codecsMap.get(fmtp.payload);
            if (!codec)
                continue;
            // Specials case to convert parameter value to string.
            if (parameters && parameters['profile-level-id'])
                parameters['profile-level-id'] = String(parameters['profile-level-id']);
            codec.parameters = parameters;
        }
        // Get RTCP feedback for each codec.
        for (const fb of m.rtcpFb || []) {
            const codec = codecsMap.get(fb.payload);
            if (!codec)
                continue;
            const feedback = {
                type: fb.type,
                parameter: fb.subtype
            };
            if (!feedback.parameter)
                delete feedback.parameter;
            codec.rtcpFeedback.push(feedback);
        }
        // Get RTP header extensions.
        for (const ext of m.ext || []) {
            // Ignore encrypted extensions (not yet supported in mediasoup).
            if (ext['encrypt-uri'])
                continue;
            const headerExtension = {
                kind: kind,
                uri: ext.uri,
                preferredId: ext.value
            };
            headerExtensions.push(headerExtension);
        }
    }
    const rtpCapabilities = {
        codecs: Array.from(codecsMap.values()),
        headerExtensions: headerExtensions
    };
    return rtpCapabilities;
}
exports.extractRtpCapabilities = extractRtpCapabilities;
function extractDtlsParameters({ sdpObject }) {
    const mediaObject = (sdpObject.media || [])
        .find((m) => (m.iceUfrag && m.port !== 0));
    if (!mediaObject)
        throw new Error('no active media section found');
    const fingerprint = mediaObject.fingerprint || sdpObject.fingerprint;
    let role;
    switch (mediaObject.setup) {
        case 'active':
            role = 'client';
            break;
        case 'passive':
            role = 'server';
            break;
        case 'actpass':
            role = 'auto';
            break;
    }
    const dtlsParameters = {
        role,
        fingerprints: [
            {
                algorithm: fingerprint.type,
                value: fingerprint.hash
            }
        ]
    };
    return dtlsParameters;
}
exports.extractDtlsParameters = extractDtlsParameters;
function getCname({ offerMediaObject }) {
    const ssrcCnameLine = (offerMediaObject.ssrcs || [])
        .find((line) => line.attribute === 'cname');
    if (!ssrcCnameLine)
        return '';
    return ssrcCnameLine.value;
}
exports.getCname = getCname;
/**
 * Apply codec parameters in the given SDP m= section answer based on the
 * given RTP parameters of an offer.
 */
function applyCodecParameters({ offerRtpParameters, answerMediaObject }) {
    for (const codec of offerRtpParameters.codecs) {
        const mimeType = codec.mimeType.toLowerCase();
        // Avoid parsing codec parameters for unhandled codecs.
        if (mimeType !== 'audio/opus')
            continue;
        const rtp = (answerMediaObject.rtp || [])
            .find((r) => r.payload === codec.payloadType);
        if (!rtp)
            continue;
        // Just in case.
        answerMediaObject.fmtp = answerMediaObject.fmtp || [];
        let fmtp = answerMediaObject.fmtp
            .find((f) => f.payload === codec.payloadType);
        if (!fmtp) {
            fmtp = { payload: codec.payloadType, config: '' };
            answerMediaObject.fmtp.push(fmtp);
        }
        const parameters = sdpTransform.parseParams(fmtp.config);
        switch (mimeType) {
            case 'audio/opus':
                {
                    const spropStereo = codec.parameters['sprop-stereo'];
                    if (spropStereo !== undefined)
                        parameters.stereo = spropStereo ? 1 : 0;
                    break;
                }
        }
        // Write the codec fmtp.config back.
        fmtp.config = '';
        for (const key of Object.keys(parameters)) {
            if (fmtp.config)
                fmtp.config += ';';
            fmtp.config += `${key}=${parameters[key]}`;
        }
    }
}
exports.applyCodecParameters = applyCodecParameters;
