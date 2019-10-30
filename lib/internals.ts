/**
 * This module is intended for custom handler developers and exposes internal
 * API and utilities. No public documentation is provided.
 *
 * To load it:
 *   const internals = require('mediasoup-client/lib/internals.js');
 *   import * as internals from 'mediasoup-client/lib/internals.js';
 */

import Logger from './Logger';
import EnhancedEventEmitter from './EnhancedEventEmitter';
import * as errors from './errors';
import * as utils from './utils';
import * as ortc from './ortc';
import * as sdpCommonUtils from './handlers/sdp/commonUtils';
import * as sdpUnifiedPlanUtils from './handlers/sdp/unifiedPlanUtils';
import * as sdpPlanBUtils from './handlers/sdp/planBUtils';
import * as sdpPlainRtpUtils from './handlers/sdp/plainRtpUtils';
import RemoteSdp from './handlers/sdp/RemoteSdp';

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
