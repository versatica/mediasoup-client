"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _events = require("events");

var _Logger = _interopRequireDefault(require("./Logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var EnhancedEventEmitter =
/*#__PURE__*/
function (_EventEmitter) {
  _inherits(EnhancedEventEmitter, _EventEmitter);

  function EnhancedEventEmitter(logger) {
    var _this;

    _classCallCheck(this, EnhancedEventEmitter);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(EnhancedEventEmitter).call(this));

    _this.setMaxListeners(Infinity);

    _this._logger = logger || new _Logger["default"]('EnhancedEventEmitter');
    return _this;
  }

  _createClass(EnhancedEventEmitter, [{
    key: "safeEmit",
    value: function safeEmit(event) {
      try {
        for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }

        this.emit.apply(this, [event].concat(args));
      } catch (error) {
        this._logger.error('safeEmit() | event listener threw an error [event:%s]:%o', event, error);
      }
    }
  }, {
    key: "safeEmitAsPromise",
    value: function safeEmitAsPromise(event) {
      var _this2 = this;

      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }

      return new Promise(function (resolve, reject) {
        var callback = function callback(result) {
          resolve(result);
        };

        var errback = function errback(error) {
          _this2._logger.error('safeEmitAsPromise() | errback called [event:%s]:%o', event, error);

          reject(error);
        };

        _this2.safeEmit.apply(_this2, [event].concat(args, [callback, errback]));
      });
    }
  }]);

  return EnhancedEventEmitter;
}(_events.EventEmitter);

exports["default"] = EnhancedEventEmitter;