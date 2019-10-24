"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _events = require("events");

var _Logger = _interopRequireDefault(require("./Logger"));

var _errors = require("./errors");

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

var logger = new _Logger["default"]('CommandQueue');

var CommandQueue =
/*#__PURE__*/
function (_EventEmitter) {
  _inherits(CommandQueue, _EventEmitter);

  function CommandQueue() {
    var _this;

    _classCallCheck(this, CommandQueue);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(CommandQueue).call(this));

    _this.setMaxListeners(Infinity); // Closed flag.
    // @type {Boolean}


    _this._closed = false; // Busy running a command.
    // @type {Boolean}

    _this._busy = false; // Queue for pending commands. Each command is an Object with method,
    // resolve, reject, and other members (depending the case).
    // @type {Array<Object>}

    _this._queue = [];
    return _this;
  }

  _createClass(CommandQueue, [{
    key: "close",
    value: function close() {
      this._closed = true;
    }
  }, {
    key: "push",
    value: function push(method, data) {
      var _this2 = this;

      var command = Object.assign({
        method: method
      }, data);
      logger.debug('push() [method:%s]', method);
      return new Promise(function (resolve, reject) {
        var queue = _this2._queue;
        command.resolve = resolve;
        command.reject = reject; // Append command to the queue.

        queue.push(command);

        _this2._handlePendingCommands();
      });
    }
  }, {
    key: "_handlePendingCommands",
    value: function _handlePendingCommands() {
      var _this3 = this;

      if (this._busy) return;
      var queue = this._queue; // Take the first command.

      var command = queue[0];
      if (!command) return;
      this._busy = true; // Execute it.

      this._handleCommand(command).then(function () {
        _this3._busy = false; // Remove the first command (the completed one) from the queue.

        queue.shift(); // And continue.

        _this3._handlePendingCommands();
      });
    }
  }, {
    key: "_handleCommand",
    value: function _handleCommand(command) {
      var _this4 = this;

      logger.debug('_handleCommand() [method:%s]', command.method);

      if (this._closed) {
        command.reject(new _errors.InvalidStateError('closed'));
        return Promise.resolve();
      }

      var promiseHolder = {
        promise: null
      };
      this.emit('exec', command, promiseHolder);
      return Promise.resolve().then(function () {
        return promiseHolder.promise;
      }).then(function (result) {
        logger.debug('_handleCommand() | command succeeded [method:%s]', command.method);

        if (_this4._closed) {
          command.reject(new _errors.InvalidStateError('closed'));
          return;
        } // Resolve the command with the given result (if any).


        command.resolve(result);
      })["catch"](function (error) {
        logger.error('_handleCommand() | command failed [method:%s]: %o', command.method, error); // Reject the command with the error.

        command.reject(error);
      });
    }
  }]);

  return CommandQueue;
}(_events.EventEmitter);

exports["default"] = CommandQueue;