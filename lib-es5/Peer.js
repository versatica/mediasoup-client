"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _Logger = _interopRequireDefault(require("./Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("./EnhancedEventEmitter"));

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

var logger = new _Logger["default"]('Peer');

var Peer =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Peer, _EnhancedEventEmitter);

  /**
   * @private
   *
   * @emits {consumer: Consumer} newconsumer
   * @emits {originator: String, [appData]: Any} close
   *
   * @emits @close
   */
  function Peer(name, appData) {
    var _this;

    _classCallCheck(this, Peer);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Peer).call(this, logger)); // Name.
    // @type {String}

    _this._name = name; // Closed flag.
    // @type {Boolean}

    _this._closed = false; // App custom data.
    // @type {Any}

    _this._appData = appData; // Map of Consumers indexed by id.
    // @type {map<Number, Consumer>}

    _this._consumers = new Map();
    return _this;
  }
  /**
   * Peer name.
   *
   * @return {String}
   */


  _createClass(Peer, [{
    key: "close",

    /**
     * Closes the Peer.
     * This is called when the local Room is closed.
     *
     * @private
     */
    value: function close() {
      logger.debug('close()');
      if (this._closed) return;
      this._closed = true;
      this.emit('@close');
      this.safeEmit('close', 'local'); // Close all the Consumers.

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = this._consumers.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var consumer = _step.value;
          consumer.close();
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
    /**
     * The remote Peer or Room was closed.
     * Invoked via remote notification.
     *
     * @private
     *
     * @param {Any} [appData] - App custom data.
     */

  }, {
    key: "remoteClose",
    value: function remoteClose(appData) {
      logger.debug('remoteClose()');
      if (this._closed) return;
      this._closed = true;
      this.emit('@close');
      this.safeEmit('close', 'remote', appData); // Close all the Consumers.

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = this._consumers.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var consumer = _step2.value;
          consumer.remoteClose();
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }
    /**
     * Get the Consumer with the given id.
     *
     * @param {Number} id
     *
     * @return {Consumer}
     */

  }, {
    key: "getConsumerById",
    value: function getConsumerById(id) {
      return this._consumers.get(id);
    }
    /**
     * Add an associated Consumer.
     *
     * @private
     *
     * @param {Consumer} consumer
     */

  }, {
    key: "addConsumer",
    value: function addConsumer(consumer) {
      var _this2 = this;

      if (this._consumers.has(consumer.id)) throw new Error("Consumer already exists [id:".concat(consumer.id, "]")); // Store it.

      this._consumers.set(consumer.id, consumer); // Handle it.


      consumer.on('@close', function () {
        _this2._consumers["delete"](consumer.id);
      }); // Emit event.

      this.safeEmit('newconsumer', consumer);
    }
  }, {
    key: "name",
    get: function get() {
      return this._name;
    }
    /**
     * Whether the Peer is closed.
     *
     * @return {Boolean}
     */

  }, {
    key: "closed",
    get: function get() {
      return this._closed;
    }
    /**
     * App custom data.
     *
     * @return {Any}
     */

  }, {
    key: "appData",
    get: function get() {
      return this._appData;
    }
    /**
     * The list of Consumers.
     *
     * @return {Array<Consumer>}
     */

  }, {
    key: "consumers",
    get: function get() {
      return Array.from(this._consumers.values());
    }
  }]);

  return Peer;
}(_EnhancedEventEmitter2["default"]);

exports["default"] = Peer;