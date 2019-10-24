"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setDeviceHandler = setDeviceHandler;
exports.isDeviceSupported = isDeviceSupported;
exports.getDeviceInfo = getDeviceInfo;
exports.checkCapabilitiesForRoom = checkCapabilitiesForRoom;
Object.defineProperty(exports, "Room", {
  enumerable: true,
  get: function get() {
    return _Room["default"];
  }
});
exports.internals = void 0;

var ortc = _interopRequireWildcard(require("./ortc"));

var _Device = _interopRequireDefault(require("./Device"));

var _Room = _interopRequireDefault(require("./Room"));

var internals = _interopRequireWildcard(require("./internals"));

exports.internals = internals;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

/**
 * Provides a custom RTC handler class and avoid auto-detection. Useful
 * for making mediasoup-client work with custom devices.
 *
 * NOTE: This function must be called upon library load.
 *
 * @param {Class} handler - A handler class.
 * @param {Object} [metadata] - Handler metadata.
 * @param {String} [metadata.flag] - Handler flag.
 * @param {String} [metadata.name] - Handler name.
 * @param {String} [metadata.version] - Handler version.
 * @param {Object} [metadata.bowser] - Handler bowser Object.
 */
function setDeviceHandler(handler, metadata) {
  _Device["default"].setHandler(handler, metadata);
}
/**
 * Whether the current browser or device is supported.
 *
 * @return {Boolean}
 *
 * @example
 * isDeviceSupported()
 * // => true
 */


function isDeviceSupported() {
  return _Device["default"].isSupported();
}
/**
 * Get information regarding the current browser or device.
 *
 * @return {Object} - Object with `name` (String) and version {String}.
 *
 * @example
 * getDeviceInfo()
 * // => { flag: 'chrome', name: 'Chrome', version: '59.0', bowser: {} }
 */


function getDeviceInfo() {
  return {
    flag: _Device["default"].getFlag(),
    name: _Device["default"].getName(),
    version: _Device["default"].getVersion(),
    bowser: _Device["default"].getBowser()
  };
}
/**
 * Check whether this device/browser can send/receive audio/video in a room
 * whose RTP capabilities are given.
 *
 * @param {Object} Room RTP capabilities.
 *
 * @return {Promise} Resolves to an Object with 'audio' and 'video' Booleans.
 */


function checkCapabilitiesForRoom(roomRtpCapabilities) {
  if (!_Device["default"].isSupported()) return Promise.reject(new Error('current browser/device not supported'));
  return _Device["default"].Handler.getNativeRtpCapabilities().then(function (nativeRtpCapabilities) {
    var extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(nativeRtpCapabilities, roomRtpCapabilities);
    return {
      audio: ortc.canSend('audio', extendedRtpCapabilities),
      video: ortc.canSend('video', extendedRtpCapabilities)
    };
  });
}
/**
 * Expose the Room class.
 *
 * @example
 * const room = new Room();`
 */