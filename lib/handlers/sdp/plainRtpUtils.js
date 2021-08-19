"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRtpEncodings = exports.extractPlainRtpParameters = void 0;
function extractPlainRtpParameters({ sdpObject, kind }) {
    const mediaObject = (sdpObject.media || [])
        .find((m) => m.type === kind);
    if (!mediaObject)
        throw new Error(`m=${kind} section not found`);
    const connectionObject = mediaObject.connection || sdpObject.connection;
    return {
        ip: connectionObject.ip,
        ipVersion: connectionObject.version,
        port: mediaObject.port
    };
}
exports.extractPlainRtpParameters = extractPlainRtpParameters;
function getRtpEncodings({ sdpObject, kind }) {
    const mediaObject = (sdpObject.media || [])
        .find((m) => m.type === kind);
    if (!mediaObject)
        throw new Error(`m=${kind} section not found`);
    const ssrcCnameLine = (mediaObject.ssrcs || [])[0];
    const ssrc = ssrcCnameLine ? ssrcCnameLine.id : null;
    if (ssrc)
        return [{ ssrc }];
    else
        return [];
}
exports.getRtpEncodings = getRtpEncodings;
