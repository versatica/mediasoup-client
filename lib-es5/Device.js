"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _bowser = _interopRequireDefault(require("bowser"));

var _Logger = _interopRequireDefault(require("./Logger"));

var _Chrome = _interopRequireDefault(require("./handlers/Chrome70"));

var _Chrome2 = _interopRequireDefault(require("./handlers/Chrome69"));

var _Chrome3 = _interopRequireDefault(require("./handlers/Chrome67"));

var _Chrome4 = _interopRequireDefault(require("./handlers/Chrome55"));

var _Safari = _interopRequireDefault(require("./handlers/Safari12"));

var _Safari2 = _interopRequireDefault(require("./handlers/Safari11"));

var _Firefox = _interopRequireDefault(require("./handlers/Firefox65"));

var _Firefox2 = _interopRequireDefault(require("./handlers/Firefox59"));

var _Firefox3 = _interopRequireDefault(require("./handlers/Firefox50"));

var _Edge = _interopRequireDefault(require("./handlers/Edge11"));

var _ReactNative = _interopRequireDefault(require("./handlers/ReactNative"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var logger = new _Logger["default"]('Device');
/**
 * Class with static members representing the underlying device or browser.
 */

var Device =
/*#__PURE__*/
function () {
  function Device() {
    _classCallCheck(this, Device);
  }

  _createClass(Device, null, [{
    key: "setHandler",

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
    value: function setHandler(handler) {
      var metadata = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      Device._detected = true;
      Device._handlerClass = handler; // Optional fields.

      Device._flag = metadata.flag;
      Device._name = metadata.name;
      Device._version = metadata.version;
      Device._bowser = metadata.bowser || {};
    }
    /**
     * Get the device flag.
     *
     * @return {String}
     */

  }, {
    key: "getFlag",
    value: function getFlag() {
      if (!Device._detected) Device._detect();
      return Device._flag;
    }
    /**
     * Get the device name.
     *
     * @return {String}
     */

  }, {
    key: "getName",
    value: function getName() {
      if (!Device._detected) Device._detect();
      return Device._name;
    }
    /**
     * Get the device version.
     *
     * @return {String}
     */

  }, {
    key: "getVersion",
    value: function getVersion() {
      if (!Device._detected) Device._detect();
      return Device._version;
    }
    /**
     * Get the bowser module Object.
     *
     * @return {Object}
     */

  }, {
    key: "getBowser",
    value: function getBowser() {
      if (!Device._detected) Device._detect();
      return Device._bowser;
    }
    /**
     * Whether this device is supported.
     *
     * @return {Boolean}
     */

  }, {
    key: "isSupported",
    value: function isSupported() {
      if (!Device._detected) Device._detect();
      return Boolean(Device._handlerClass);
    }
    /**
     * Returns a suitable WebRTC handler class.
     *
     * @type {Class}
     */

  }, {
    key: "_detect",

    /**
     * Detects the current device/browser.
     *
     * @private
     */
    value: function _detect() {
      Device._detected = true; // If this is React-Native manually fill data.

      if (global.navigator && global.navigator.product === 'ReactNative') {
        Device._flag = 'react-native';
        Device._name = 'ReactNative';
        Device._version = undefined; // NOTE: No idea how to know it.

        Device._bowser = {};
        Device._handlerClass = _ReactNative["default"];
      } // If this is a browser use bowser module detection.
      else if (global.navigator && typeof global.navigator.userAgent === 'string') {
          var ua = global.navigator.userAgent;

          var browser = _bowser["default"].detect(ua);

          Device._flag = undefined;
          Device._name = browser.name || undefined;
          Device._version = browser.version || undefined;
          Device._bowser = browser;
          Device._handlerClass = null; // Chrome, Chromium (desktop and mobile).

          if (_bowser["default"].check({
            chrome: '70',
            chromium: '70'
          }, true, ua)) {
            Device._flag = 'chrome';
            Device._handlerClass = _Chrome["default"];
          } else if (_bowser["default"].check({
            chrome: '69',
            chromium: '69'
          }, true, ua)) {
            Device._flag = 'chrome';
            Device._handlerClass = _Chrome2["default"];
          } else if (_bowser["default"].check({
            chrome: '67',
            chromium: '67'
          }, true, ua)) {
            Device._flag = 'chrome';
            Device._handlerClass = _Chrome3["default"];
          } else if (_bowser["default"].check({
            chrome: '55',
            chromium: '55'
          }, true, ua)) {
            Device._flag = 'chrome';
            Device._handlerClass = _Chrome4["default"];
          } // Special case for old Chrome >= 49 if webrtc-adapter is present.
          else if (_bowser["default"].check({
              chrome: '49',
              chromium: '49'
            }, true, ua) && global.adapter) {
              Device._flag = 'chrome';
              Device._handlerClass = _Chrome4["default"];
            } // Firefox (desktop and mobile).
            else if (_bowser["default"].check({
                firefox: '65'
              }, true, ua)) {
                Device._flag = 'firefox';
                Device._handlerClass = _Firefox["default"];
              } // Firefox (desktop and mobile).
              else if (_bowser["default"].check({
                  firefox: '59'
                }, true, ua)) {
                  Device._flag = 'firefox';
                  Device._handlerClass = _Firefox2["default"];
                } else if (_bowser["default"].check({
                  firefox: '50'
                }, true, ua)) {
                  Device._flag = 'firefox';
                  Device._handlerClass = _Firefox3["default"];
                } // Safari (desktop and mobile) with Unified-Plan support.
                else if (_bowser["default"].check({
                    safari: '12.1'
                  }, true, ua) && typeof RTCRtpTransceiver !== 'undefined' && RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')) {
                    Device._flag = 'safari';
                    Device._handlerClass = _Safari["default"];
                  } // Safari (desktop and mobile) with Plab-B support.
                  else if (_bowser["default"].check({
                      safari: '11'
                    }, true, ua)) {
                      Device._flag = 'safari';
                      Device._handlerClass = _Safari2["default"];
                    } // Edge (desktop).
                    else if (_bowser["default"].check({
                        msedge: '11'
                      }, true, ua)) {
                        Device._flag = 'msedge';
                        Device._handlerClass = _Edge["default"];
                      } // Opera (desktop and mobile).
                      else if (_bowser["default"].check({
                          opera: '57'
                        }, true, ua)) {
                          Device._flag = 'opera';
                          Device._handlerClass = _Chrome["default"];
                        } else if (_bowser["default"].check({
                          opera: '44'
                        }, true, ua)) {
                          Device._flag = 'opera';
                          Device._handlerClass = _Chrome4["default"];
                        } // Best effort for Chromium based browsers.
                        else if (browser.chromium || browser.blink || browser.webkit) {
                            logger.debug('best effort Chrome based browser detection [name:"%s"]', browser.name);
                            Device._flag = 'chrome';
                            var match = ua.match(/(?:(?:Chrome|Chromium))[ /](\w+)/i);

                            if (match) {
                              var version = Number(match[1]);
                              if (version >= 70) Device._handlerClass = _Chrome["default"];else if (version >= 69) Device._handlerClass = _Chrome2["default"];else if (version >= 67) Device._handlerClass = _Chrome3["default"];else Device._handlerClass = _Chrome4["default"];
                            } else {
                              Device._handlerClass = _Chrome["default"];
                            }
                          }

          if (Device.isSupported()) {
            logger.debug('browser supported [flag:%s, name:"%s", version:%s, handler:%s]', Device._flag, Device._name, Device._version, Device._handlerClass.tag);
          } else {
            logger.warn('browser not supported [name:%s, version:%s]', Device._name, Device._version);
          }
        } // Otherwise fail.
        else {
            logger.warn('device not supported');
          }
    }
  }, {
    key: "Handler",
    get: function get() {
      if (!Device._detected) Device._detect();
      return Device._handlerClass;
    }
  }]);

  return Device;
}(); // Initialized flag.
// @type {Boolean}


exports["default"] = Device;
Device._detected = false; // Device flag.
// @type {String}

Device._flag = undefined; // Device name.
// @type {String}

Device._name = undefined; // Device version.
// @type {String}

Device._version = undefined; // bowser module Object.
// @type {Object}

Device._bowser = undefined; // WebRTC hander for this device.
// @type {Class}

Device._handlerClass = null;