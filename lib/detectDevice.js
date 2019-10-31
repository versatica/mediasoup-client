"use strict";
/* global RTCRtpTransceiver */
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
const bowser = __importStar(require("bowser"));
const Logger_1 = __importDefault(require("./Logger"));
// const Chrome74 = require('./handlers/Chrome74'); // Disabled for now.
const Chrome70_1 = __importDefault(require("./handlers/Chrome70"));
const Chrome67_1 = __importDefault(require("./handlers/Chrome67"));
const Chrome55_1 = __importDefault(require("./handlers/Chrome55"));
const Firefox60_1 = __importDefault(require("./handlers/Firefox60"));
const Safari12_1 = __importDefault(require("./handlers/Safari12"));
const Safari11_1 = __importDefault(require("./handlers/Safari11"));
const Edge11_1 = __importDefault(require("./handlers/Edge11"));
const ReactNative_1 = __importDefault(require("./handlers/ReactNative"));
const logger = new Logger_1.default('detectDevice');
function default_1() {
    // React-Native.
    // NOTE: react-native-webrtc >= 1.75.0 is required.
    if (typeof navigator === 'object' && navigator.product === 'ReactNative') {
        if (typeof RTCPeerConnection === 'undefined') {
            logger.warn('unsupported ReactNative without RTCPeerConnection');
            return null;
        }
        return ReactNative_1.default;
    }
    // Browser.
    else if (typeof navigator === 'object' && typeof navigator.userAgent === 'string') {
        const ua = navigator.userAgent;
        const browser = bowser.getParser(ua);
        const engine = browser.getEngine();
        // Chrome and Chromium.
        // NOTE: Disable Chrome74 handler for now.
        // if (browser.satisfies({ chrome: '>=74', chromium: '>=74' }))
        // {
        // 	return Chrome74;
        // }
        if (browser.satisfies({ chrome: '>=70', chromium: '>=70' })) {
            return Chrome70_1.default;
        }
        else if (browser.satisfies({ chrome: '>=67', chromium: '>=67' })) {
            return Chrome67_1.default;
        }
        else if (browser.satisfies({ chrome: '>=55', chromium: '>=55' })) {
            return Chrome55_1.default;
        }
        // Firefox.
        else if (browser.satisfies({ firefox: '>=60' })) {
            return Firefox60_1.default;
        }
        // Safari with Unified-Plan support.
        else if (browser.satisfies({ safari: '>=12.1' }) &&
            typeof RTCRtpTransceiver !== 'undefined' &&
            RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')) {
            return Safari12_1.default;
        }
        // Safari with Plab-B support.
        else if (browser.satisfies({ safari: '>=11' })) {
            return Safari11_1.default;
        }
        // Old Edge with ORTC support.
        else if (browser.satisfies({ 'microsoft edge': '>=11' }) &&
            browser.satisfies({ 'microsoft edge': '<=18' })) {
            return Edge11_1.default;
        }
        // Best effort for Chromium based browsers.
        else if (engine.name && engine.name.toLowerCase() === 'blink') {
            logger.debug('best effort Chromium based browser detection');
            const match = ua.match(/(?:(?:Chrome|Chromium))[ /](\w+)/i);
            if (match) {
                const version = Number(match[1]);
                // NOTE: Disable Chrome74 handler for now.
                // if (version >= 74)
                // 	return Chrome74;
                if (version >= 70)
                    return Chrome70_1.default;
                else if (version >= 67)
                    return Chrome67_1.default;
                else
                    return Chrome55_1.default;
            }
            else {
                // NOTE: Disable Chrome74 handler for now.
                // return Chrome74;
                return Chrome70_1.default;
            }
        }
        // Unsupported browser.
        else {
            logger.warn('browser not supported [name:%s, version:%s]', browser.getBrowserName(), browser.getBrowserVersion());
            return null;
        }
    }
    // Unknown device.
    else {
        logger.warn('unknown device');
        return null;
    }
}
exports.default = default_1;
