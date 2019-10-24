"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _Logger = _interopRequireDefault(require("./Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("./EnhancedEventEmitter"));

var _errors = require("./errors");

var utils = _interopRequireWildcard(require("./utils"));

var _Device = _interopRequireDefault(require("./Device"));

var _CommandQueue = _interopRequireDefault(require("./CommandQueue"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var DEFAULT_STATS_INTERVAL = 1000;
var logger = new _Logger["default"]('Transport');

var Transport =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Transport, _EnhancedEventEmitter);

  /**
   * @private
   *
   * @emits {state: String} connectionstatechange
   * @emits {stats: Object} stats
   * @emits {originator: String, [appData]: Any} close
   *
   * @emits {method: String, [data]: Object, callback: Function, errback: Function} @request
   * @emits {method: String, [data]: Object} @notify
   * @emits @close
   */
  function Transport(direction, extendedRtpCapabilities, settings, appData) {
    var _this;

    _classCallCheck(this, Transport);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Transport).call(this, logger));
    logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]', direction, extendedRtpCapabilities); // Id.
    // @type {Number}

    _this._id = utils.randomNumber(); // Closed flag.
    // @type {Boolean}

    _this._closed = false; // Direction.
    // @type {String}

    _this._direction = direction; // Room settings.
    // @type {Object}

    _this._settings = settings; // App custom data.
    // @type {Any}

    _this._appData = appData; // Periodic stats flag.
    // @type {Boolean}

    _this._statsEnabled = false; // Commands handler.
    // @type {CommandQueue}

    _this._commandQueue = new _CommandQueue["default"](); // Device specific handler.

    _this._handler = new _Device["default"].Handler(direction, extendedRtpCapabilities, settings); // Transport state. Values can be:
    // 'new'/'connecting'/'connected'/'failed'/'disconnected'/'closed'
    // @type {String}

    _this._connectionState = 'new';

    _this._commandQueue.on('exec', _this._execCommand.bind(_assertThisInitialized(_this)));

    _this._handleHandler();

    return _this;
  }
  /**
   * Transport id.
   *
   * @return {Number}
   */


  _createClass(Transport, [{
    key: "close",

    /**
     * Close the Transport.
     *
     * @param {Any} [appData] - App custom data.
     */
    value: function close(appData) {
      logger.debug('close()');
      if (this._closed) return;
      this._closed = true;

      if (this._statsEnabled) {
        this._statsEnabled = false;
        this.disableStats();
      }

      this.safeEmit('@notify', 'closeTransport', {
        id: this._id,
        appData: appData
      });
      this.emit('@close');
      this.safeEmit('close', 'local', appData);

      this._destroy();
    }
    /**
     * My remote Transport was closed.
     * Invoked via remote notification.
     *
     * @private
     *
     * @param {Any} [appData] - App custom data.
     * @param {Object} destroy - Whether the local transport must be destroyed.
     */

  }, {
    key: "remoteClose",
    value: function remoteClose(appData, _ref) {
      var destroy = _ref.destroy;
      logger.debug('remoteClose() [destroy:%s]', destroy);
      if (this._closed) return;

      if (!destroy) {
        this._handler.remoteClosed();

        return;
      }

      this._closed = true;
      this.emit('@close');
      this.safeEmit('close', 'remote', appData);

      this._destroy();
    }
  }, {
    key: "_destroy",
    value: function _destroy() {
      // Close the CommandQueue.
      this._commandQueue.close(); // Close the handler.


      this._handler.close();
    }
  }, {
    key: "restartIce",
    value: function restartIce() {
      var _this2 = this;

      logger.debug('restartIce()');
      if (this._closed) return;else if (this._connectionState === 'new') return;
      Promise.resolve().then(function () {
        var data = {
          id: _this2._id
        };
        return _this2.safeEmitAsPromise('@request', 'restartTransport', data);
      }).then(function (response) {
        var remoteIceParameters = response.iceParameters; // Enqueue command.

        return _this2._commandQueue.push('restartIce', {
          remoteIceParameters: remoteIceParameters
        });
      })["catch"](function (error) {
        logger.error('restartIce() | failed: %o', error);
      });
    }
  }, {
    key: "enableStats",
    value: function enableStats() {
      var interval = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : DEFAULT_STATS_INTERVAL;
      logger.debug('enableStats() [interval:%s]', interval);
      if (typeof interval !== 'number' || interval < 1000) interval = DEFAULT_STATS_INTERVAL;
      this._statsEnabled = true;
      var data = {
        id: this._id,
        interval: interval
      };
      this.safeEmit('@notify', 'enableTransportStats', data);
    }
  }, {
    key: "disableStats",
    value: function disableStats() {
      logger.debug('disableStats()');
      this._statsEnabled = false;
      var data = {
        id: this._id
      };
      this.safeEmit('@notify', 'disableTransportStats', data);
    }
  }, {
    key: "_handleHandler",
    value: function _handleHandler() {
      var _this3 = this;

      var handler = this._handler;
      handler.on('@connectionstatechange', function (state) {
        if (_this3._connectionState === state) return;
        logger.debug('Transport connection state changed to %s', state);
        _this3._connectionState = state;
        if (!_this3._closed) _this3.safeEmit('connectionstatechange', state);
      });
      handler.on('@needcreatetransport', function (transportLocalParameters, callback, errback) {
        var data = {
          id: _this3._id,
          direction: _this3._direction,
          options: _this3._settings.transportOptions,
          appData: _this3._appData
        };

        if (transportLocalParameters) {
          if (transportLocalParameters.dtlsParameters) data.dtlsParameters = transportLocalParameters.dtlsParameters;else if (transportLocalParameters.plainRtpParameters) data.plainRtpParameters = transportLocalParameters.plainRtpParameters;
        }

        _this3.safeEmit('@request', 'createTransport', data, callback, errback);
      });
      handler.on('@needupdatetransport', function (transportLocalParameters) {
        var data = {
          id: _this3._id
        };

        if (transportLocalParameters) {
          if (transportLocalParameters.dtlsParameters) data.dtlsParameters = transportLocalParameters.dtlsParameters;else if (transportLocalParameters.plainRtpParameters) data.plainRtpParameters = transportLocalParameters.plainRtpParameters;
        }

        _this3.safeEmit('@notify', 'updateTransport', data);
      });
      handler.on('@needupdateproducer', function (producer, rtpParameters) {
        var data = {
          id: producer.id,
          rtpParameters: rtpParameters
        }; // Update Producer RTP parameters.

        producer.setRtpParameters(rtpParameters); // Notify the server.

        _this3.safeEmit('@notify', 'updateProducer', data);
      });
    }
    /**
     * Send the given Producer over this Transport.
     *
     * @private
     *
     * @param {Producer} producer
     *
     * @return {Promise}
     */

  }, {
    key: "addProducer",
    value: function addProducer(producer) {
      logger.debug('addProducer() [producer:%o]', producer);
      if (this._closed) return Promise.reject(new _errors.InvalidStateError('Transport closed'));else if (this._direction !== 'send') return Promise.reject(new Error('not a sending Transport')); // Enqueue command.

      return this._commandQueue.push('addProducer', {
        producer: producer
      });
    }
    /**
     * @private
     */

  }, {
    key: "removeProducer",
    value: function removeProducer(producer, originator, appData) {
      logger.debug('removeProducer() [producer:%o]', producer); // Enqueue command.

      if (!this._closed) {
        this._commandQueue.push('removeProducer', {
          producer: producer
        })["catch"](function () {});
      }

      if (originator === 'local') this.safeEmit('@notify', 'closeProducer', {
        id: producer.id,
        appData: appData
      });
    }
    /**
     * @private
     */

  }, {
    key: "pauseProducer",
    value: function pauseProducer(producer, appData) {
      logger.debug('pauseProducer() [producer:%o]', producer);
      var data = {
        id: producer.id,
        appData: appData
      };
      this.safeEmit('@notify', 'pauseProducer', data);
    }
    /**
     * @private
     */

  }, {
    key: "resumeProducer",
    value: function resumeProducer(producer, appData) {
      logger.debug('resumeProducer() [producer:%o]', producer);
      var data = {
        id: producer.id,
        appData: appData
      };
      this.safeEmit('@notify', 'resumeProducer', data);
    }
    /**
     * @private
     *
     * @return {Promise}
     */

  }, {
    key: "replaceProducerTrack",
    value: function replaceProducerTrack(producer, track) {
      logger.debug('replaceProducerTrack() [producer:%o]', producer);
      return this._commandQueue.push('replaceProducerTrack', {
        producer: producer,
        track: track
      });
    }
    /**
     * @private
     */

  }, {
    key: "enableProducerStats",
    value: function enableProducerStats(producer, interval) {
      logger.debug('enableProducerStats() [producer:%o]', producer);
      var data = {
        id: producer.id,
        interval: interval
      };
      this.safeEmit('@notify', 'enableProducerStats', data);
    }
    /**
     * @private
     */

  }, {
    key: "disableProducerStats",
    value: function disableProducerStats(producer) {
      logger.debug('disableProducerStats() [producer:%o]', producer);
      var data = {
        id: producer.id
      };
      this.safeEmit('@notify', 'disableProducerStats', data);
    }
    /**
     * Receive the given Consumer over this Transport.
     *
     * @private
     *
     * @param {Consumer} consumer
     *
     * @return {Promise} Resolves to a remote MediaStreamTrack.
     */

  }, {
    key: "addConsumer",
    value: function addConsumer(consumer) {
      logger.debug('addConsumer() [consumer:%o]', consumer);
      if (this._closed) return Promise.reject(new _errors.InvalidStateError('Transport closed'));else if (this._direction !== 'recv') return Promise.reject(new Error('not a receiving Transport')); // Enqueue command.

      return this._commandQueue.push('addConsumer', {
        consumer: consumer
      });
    }
    /**
     * @private
     */

  }, {
    key: "removeConsumer",
    value: function removeConsumer(consumer) {
      logger.debug('removeConsumer() [consumer:%o]', consumer); // Enqueue command.

      this._commandQueue.push('removeConsumer', {
        consumer: consumer
      })["catch"](function () {});
    }
    /**
     * @private
     */

  }, {
    key: "pauseConsumer",
    value: function pauseConsumer(consumer, appData) {
      logger.debug('pauseConsumer() [consumer:%o]', consumer);
      var data = {
        id: consumer.id,
        appData: appData
      };
      this.safeEmit('@notify', 'pauseConsumer', data);
    }
    /**
     * @private
     */

  }, {
    key: "resumeConsumer",
    value: function resumeConsumer(consumer, appData) {
      logger.debug('resumeConsumer() [consumer:%o]', consumer);
      var data = {
        id: consumer.id,
        appData: appData
      };
      this.safeEmit('@notify', 'resumeConsumer', data);
    }
    /**
     * @private
     */

  }, {
    key: "setConsumerPreferredProfile",
    value: function setConsumerPreferredProfile(consumer, profile) {
      logger.debug('setConsumerPreferredProfile() [consumer:%o]', consumer);
      var data = {
        id: consumer.id,
        profile: profile
      };
      this.safeEmit('@notify', 'setConsumerPreferredProfile', data);
    }
    /**
     * @private
     */

  }, {
    key: "enableConsumerStats",
    value: function enableConsumerStats(consumer, interval) {
      logger.debug('enableConsumerStats() [consumer:%o]', consumer);
      var data = {
        id: consumer.id,
        interval: interval
      };
      this.safeEmit('@notify', 'enableConsumerStats', data);
    }
    /**
     * @private
     */

  }, {
    key: "disableConsumerStats",
    value: function disableConsumerStats(consumer) {
      logger.debug('disableConsumerStats() [consumer:%o]', consumer);
      var data = {
        id: consumer.id
      };
      this.safeEmit('@notify', 'disableConsumerStats', data);
    }
    /**
     * Receive remote stats.
     *
     * @private
     *
     * @param {Object} stats
     */

  }, {
    key: "remoteStats",
    value: function remoteStats(stats) {
      this.safeEmit('stats', stats);
    }
  }, {
    key: "_execCommand",
    value: function _execCommand(command, promiseHolder) {
      var promise;

      try {
        switch (command.method) {
          case 'addProducer':
            {
              var producer = command.producer;
              promise = this._execAddProducer(producer);
              break;
            }

          case 'removeProducer':
            {
              var _producer = command.producer;
              promise = this._execRemoveProducer(_producer);
              break;
            }

          case 'replaceProducerTrack':
            {
              var _producer2 = command.producer,
                  track = command.track;
              promise = this._execReplaceProducerTrack(_producer2, track);
              break;
            }

          case 'addConsumer':
            {
              var consumer = command.consumer;
              promise = this._execAddConsumer(consumer);
              break;
            }

          case 'removeConsumer':
            {
              var _consumer = command.consumer;
              promise = this._execRemoveConsumer(_consumer);
              break;
            }

          case 'restartIce':
            {
              var remoteIceParameters = command.remoteIceParameters;
              promise = this._execRestartIce(remoteIceParameters);
              break;
            }

          default:
            {
              promise = Promise.reject(new Error("unknown command method \"".concat(command.method, "\"")));
            }
        }
      } catch (error) {
        promise = Promise.reject(error);
      } // Fill the given Promise holder.


      promiseHolder.promise = promise;
    }
  }, {
    key: "_execAddProducer",
    value: function _execAddProducer(producer) {
      var _this4 = this;

      logger.debug('_execAddProducer()');
      var producerRtpParameters; // Call the handler.

      return Promise.resolve().then(function () {
        return _this4._handler.addProducer(producer);
      }).then(function (rtpParameters) {
        producerRtpParameters = rtpParameters;
        var data = {
          id: producer.id,
          kind: producer.kind,
          transportId: _this4._id,
          rtpParameters: rtpParameters,
          paused: producer.locallyPaused,
          appData: producer.appData
        };
        return _this4.safeEmitAsPromise('@request', 'createProducer', data);
      }).then(function () {
        producer.setRtpParameters(producerRtpParameters);
      });
    }
  }, {
    key: "_execRemoveProducer",
    value: function _execRemoveProducer(producer) {
      logger.debug('_execRemoveProducer()'); // Call the handler.

      return this._handler.removeProducer(producer);
    }
  }, {
    key: "_execReplaceProducerTrack",
    value: function _execReplaceProducerTrack(producer, track) {
      logger.debug('_execReplaceProducerTrack()'); // Call the handler.

      return this._handler.replaceProducerTrack(producer, track);
    }
  }, {
    key: "_execAddConsumer",
    value: function _execAddConsumer(consumer) {
      var _this5 = this;

      logger.debug('_execAddConsumer()');
      var consumerTrack; // Call the handler.

      return Promise.resolve().then(function () {
        return _this5._handler.addConsumer(consumer);
      }).then(function (track) {
        consumerTrack = track;
        var data = {
          id: consumer.id,
          transportId: _this5.id,
          paused: consumer.locallyPaused,
          preferredProfile: consumer.preferredProfile
        };
        return _this5.safeEmitAsPromise('@request', 'enableConsumer', data);
      }).then(function (response) {
        var paused = response.paused,
            preferredProfile = response.preferredProfile,
            effectiveProfile = response.effectiveProfile;
        if (paused) consumer.remotePause();
        if (preferredProfile) consumer.remoteSetPreferredProfile(preferredProfile);
        if (effectiveProfile) consumer.remoteEffectiveProfileChanged(effectiveProfile);
        return consumerTrack;
      });
    }
  }, {
    key: "_execRemoveConsumer",
    value: function _execRemoveConsumer(consumer) {
      logger.debug('_execRemoveConsumer()'); // Call the handler.

      return this._handler.removeConsumer(consumer);
    }
  }, {
    key: "_execRestartIce",
    value: function _execRestartIce(remoteIceParameters) {
      logger.debug('_execRestartIce()'); // Call the handler.

      return this._handler.restartIce(remoteIceParameters);
    }
  }, {
    key: "id",
    get: function get() {
      return this._id;
    }
    /**
     * Whether the Transport is closed.
     *
     * @return {Boolean}
     */

  }, {
    key: "closed",
    get: function get() {
      return this._closed;
    }
    /**
     * Transport direction.
     *
     * @return {String}
     */

  }, {
    key: "direction",
    get: function get() {
      return this._direction;
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
     * Connection state.
     *
     * @return {String}
     */

  }, {
    key: "connectionState",
    get: function get() {
      return this._connectionState;
    }
    /**
     * Device handler.
     *
     * @return {Handler}
     */

  }, {
    key: "handler",
    get: function get() {
      return this._handler;
    }
  }]);

  return Transport;
}(_EnhancedEventEmitter2["default"]);

exports["default"] = Transport;