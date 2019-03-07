/**
 * This module is intended for custom handler developers and exposes internal
 * API and utilities. No public documentation is provided.
 *
 * To load it:
 *   const internals = require('mediasoup-client/lib/internals.js');
 *   import * as internals from 'mediasoup-client/lib/internals.js';
 */

const Logger = require('./Logger');
const EnhancedEventEmitter = require('./EnhancedEventEmitter');
const errors = require('./errors');
const utils = require('./utils');
const ortc = require('./ortc');
const sdpCommonUtils = require('./handlers/sdp/commonUtils');
const sdpUnifiedPlanUtils = require('./handlers/sdp/unifiedPlanUtils');
const sdpPlanBUtils = require('./handlers/sdp/planBUtils');
const sdpPlainRtpUtils = require('./handlers/sdp/plainRtpUtils');
const RemoteSdp = require('./handlers/sdp/RemoteSdp');

module.exports =
{
	Logger,
	EnhancedEventEmitter,
	errors,
	utils,
	ortc,
	sdpCommonUtils,
	sdpUnifiedPlanUtils,
	sdpPlanBUtils,
	sdpPlainRtpUtils,
	RemoteSdp
};
