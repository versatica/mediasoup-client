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
exports.mangleRtpParameters = exports.getCapabilities = void 0;
const utils = __importStar(require("../../utils"));
/**
 * Normalize ORTC based Edge's RTCRtpReceiver.getCapabilities() to produce a full
 * compliant ORTC RTCRtpCapabilities.
 */
function getCapabilities() {
    const nativeCaps = RTCRtpReceiver.getCapabilities();
    const caps = utils.clone(nativeCaps, {});
    for (const codec of caps.codecs) {
        // Rename numChannels to channels.
        codec.channels = codec.numChannels;
        delete codec.numChannels;
        // Add mimeType.
        codec.mimeType = codec.mimeType || `${codec.kind}/${codec.name}`;
        // NOTE: Edge sets some numeric parameters as string rather than number. Fix them.
        if (codec.parameters) {
            const parameters = codec.parameters;
            if (parameters.apt)
                parameters.apt = Number(parameters.apt);
            if (parameters['packetization-mode'])
                parameters['packetization-mode'] = Number(parameters['packetization-mode']);
        }
        // Delete emty parameter String in rtcpFeedback.
        for (const feedback of codec.rtcpFeedback || []) {
            if (!feedback.parameter)
                feedback.parameter = '';
        }
    }
    return caps;
}
exports.getCapabilities = getCapabilities;
/**
 * Generate RTCRtpParameters as ORTC based Edge likes.
 */
function mangleRtpParameters(rtpParameters) {
    const params = utils.clone(rtpParameters, {});
    // Rename mid to muxId.
    if (params.mid) {
        params.muxId = params.mid;
        delete params.mid;
    }
    for (const codec of params.codecs) {
        // Rename channels to numChannels.
        if (codec.channels) {
            codec.numChannels = codec.channels;
            delete codec.channels;
        }
        // Add codec.name (requried by Edge).
        if (codec.mimeType && !codec.name)
            codec.name = codec.mimeType.split('/')[1];
        // Remove mimeType.
        delete codec.mimeType;
    }
    return params;
}
exports.mangleRtpParameters = mangleRtpParameters;
