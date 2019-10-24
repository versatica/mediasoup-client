"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _debug = _interopRequireDefault(require("debug"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var APP_NAME = 'mediasoup-client';

var Logger =
/*#__PURE__*/
function () {
  function Logger(prefix) {
    _classCallCheck(this, Logger);

    if (prefix) {
      this._debug = (0, _debug["default"])("".concat(APP_NAME, ":").concat(prefix));
      this._warn = (0, _debug["default"])("".concat(APP_NAME, ":WARN:").concat(prefix));
      this._error = (0, _debug["default"])("".concat(APP_NAME, ":ERROR:").concat(prefix));
    } else {
      this._debug = (0, _debug["default"])(APP_NAME);
      this._warn = (0, _debug["default"])("".concat(APP_NAME, ":WARN"));
      this._error = (0, _debug["default"])("".concat(APP_NAME, ":ERROR"));
    }
    /* eslint-disable no-console */


    this._debug.log = console.info.bind(console);
    this._warn.log = console.warn.bind(console);
    this._error.log = console.error.bind(console);
    /* eslint-enable no-console */
  }

  _createClass(Logger, [{
    key: "debug",
    get: function get() {
      return this._debug;
    }
  }, {
    key: "warn",
    get: function get() {
      return this._warn;
    }
  }, {
    key: "error",
    get: function get() {
      return this._error;
    }
  }]);

  return Logger;
}();

exports["default"] = Logger;