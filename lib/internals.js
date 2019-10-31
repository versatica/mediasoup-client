"use strict";
/**
 * This module is intended for custom handler developers and exposes internal
 * API and utilities. No public documentation is provided.
 *
 * To load it:
 *   const internals = require('mediasoup-client/lib/internals.js');
 *   import * as internals from 'mediasoup-client/lib/internals.js';
 */
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
const EnhancedEventEmitter_1 = __importDefault(require("./EnhancedEventEmitter"));
const errors = __importStar(require("./errors"));
const utils = __importStar(require("./utils"));
const ortc = __importStar(require("./ortc"));
const sdpCommonUtils = __importStar(require("./handlers/sdp/commonUtils"));
const sdpUnifiedPlanUtils = __importStar(require("./handlers/sdp/unifiedPlanUtils"));
const sdpPlanBUtils = __importStar(require("./handlers/sdp/planBUtils"));
const sdpPlainRtpUtils = __importStar(require("./handlers/sdp/plainRtpUtils"));
const RemoteSdp_1 = __importDefault(require("./handlers/sdp/RemoteSdp"));
module.exports =
    {
        Logger: Logger_1.default,
        EnhancedEventEmitter: EnhancedEventEmitter_1.default,
        errors,
        utils,
        ortc,
        sdpCommonUtils,
        sdpUnifiedPlanUtils,
        sdpPlanBUtils,
        sdpPlainRtpUtils,
        RemoteSdp: RemoteSdp_1.default
    };
