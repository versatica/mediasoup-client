"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _Logger = _interopRequireDefault(require("./Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("./EnhancedEventEmitter"));

var _errors = require("./errors");

var utils = _interopRequireWildcard(require("./utils"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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

var DEFAULT_STATS_INTERVAL = 1000;
var SIMULCAST_DEFAULT = {
  low: 100000,
  medium: 300000,
  high: 1500000
};
var logger = new _Logger["default"]('Producer');

var Producer =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Producer, _EnhancedEventEmitter);

  /**
   * @private
   *
   * @emits {originator: String, [appData]: Any} pause
   * @emits {originator: String, [appData]: Any} resume
   * @emits {stats: Object} stats
   * @emits handled
   * @emits unhandled
   * @emits trackended
   * @emits {originator: String, [appData]: Any} close
   *
   * @emits {originator: String, [appData]: Any} @close
   */
  function Producer(track, options, appData) {
    var _this;

    _classCallCheck(this, Producer);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Producer).call(this, logger)); // Id.
    // @type {Number}

    _this._id = utils.randomNumber(); // Closed flag.
    // @type {Boolean}

    _this._closed = false; // Original track.
    // @type {MediaStreamTrack}

    _this._originalTrack = track; // Track cloned from the original one (if supported).
    // @type {MediaStreamTrack}

    try {
      _this._track = track.clone();
    } catch (error) {
      _this._track = track;
    } // App custom data.
    // @type {Any}


    _this._appData = appData; // Simulcast.
    // @type {Object|false}

    _this._simulcast = false;
    if (_typeof(options.simulcast) === 'object') _this._simulcast = Object.assign({}, SIMULCAST_DEFAULT, options.simulcast);else if (options.simulcast === true) _this._simulcast = Object.assign({}, SIMULCAST_DEFAULT); // Associated Transport.
    // @type {Transport}

    _this._transport = null; // RTP parameters.
    // @type {RTCRtpParameters}

    _this._rtpParameters = null; // Locally paused flag.
    // @type {Boolean}

    _this._locallyPaused = !_this._track.enabled; // Remotely paused flag.
    // @type {Boolean}

    _this._remotelyPaused = false; // Periodic stats flag.
    // @type {Boolean}

    _this._statsEnabled = false; // Periodic stats gathering interval (milliseconds).
    // @type {Number}

    _this._statsInterval = DEFAULT_STATS_INTERVAL; // Handle the effective track.

    _this._handleTrack();

    return _this;
  }
  /**
   * Producer id.
   *
   * @return {Number}
   */


  _createClass(Producer, [{
    key: "close",

    /**
     * Closes the Producer.
     *
     * @param {Any} [appData] - App custom data.
     */
    value: function close(appData) {
      logger.debug('close()');
      if (this._closed) return;
      this._closed = true;

      if (this._statsEnabled) {
        this._statsEnabled = false;

        if (this.transport) {
          this.transport.disableProducerStats(this);
        }
      }

      if (this._transport) this._transport.removeProducer(this, 'local', appData);

      this._destroy();

      this.emit('@close', 'local', appData);
      this.safeEmit('close', 'local', appData);
    }
    /**
     * My remote Producer was closed.
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
      if (this._transport) this._transport.removeProducer(this, 'remote', appData);

      this._destroy();

      this.emit('@close', 'remote', appData);
      this.safeEmit('close', 'remote', appData);
    }
  }, {
    key: "_destroy",
    value: function _destroy() {
      this._transport = false;
      this._rtpParameters = null;

      try {
        this._track.stop();
      } catch (error) {}
    }
    /**
     * Sends RTP.
     *
     * @param {transport} Transport instance.
     *
     * @return {Promise}
     */

  }, {
    key: "send",
    value: function send(transport) {
      var _this2 = this;

      logger.debug('send() [transport:%o]', transport);
      if (this._closed) return Promise.reject(new _errors.InvalidStateError('Producer closed'));else if (this._transport) return Promise.reject(new Error('already handled by a Transport'));else if (_typeof(transport) !== 'object') return Promise.reject(new TypeError('invalid Transport'));
      this._transport = transport;
      return transport.addProducer(this).then(function () {
        transport.once('@close', function () {
          if (_this2._closed || _this2._transport !== transport) return;

          _this2._transport.removeProducer(_this2, 'local');

          _this2._transport = null;
          _this2._rtpParameters = null;

          _this2.safeEmit('unhandled');
        });

        _this2.safeEmit('handled');

        if (_this2._statsEnabled) transport.enableProducerStats(_this2, _this2._statsInterval);
      })["catch"](function (error) {
        _this2._transport = null;
        throw error;
      });
    }
    /**
     * Pauses sending media.
     *
     * @param {Any} [appData] - App custom data.
     *
     * @return {Boolean} true if paused.
     */

  }, {
    key: "pause",
    value: function pause(appData) {
      logger.debug('pause()');

      if (this._closed) {
        logger.error('pause() | Producer closed');
        return false;
      } else if (this._locallyPaused) {
        return true;
      }

      this._locallyPaused = true;
      this._track.enabled = false;
      if (this._transport) this._transport.pauseProducer(this, appData);
      this.safeEmit('pause', 'local', appData); // Return true if really paused.

      return this.paused;
    }
    /**
     * My remote Producer was paused.
     * Invoked via remote notification.
     *
     * @private
     *
     * @param {Any} [appData] - App custom data.
     */

  }, {
    key: "remotePause",
    value: function remotePause(appData) {
      logger.debug('remotePause()');
      if (this._closed || this._remotelyPaused) return;
      this._remotelyPaused = true;
      this._track.enabled = false;
      this.safeEmit('pause', 'remote', appData);
    }
    /**
     * Resumes sending media.
     *
     * @param {Any} [appData] - App custom data.
     *
     * @return {Boolean} true if not paused.
     */

  }, {
    key: "resume",
    value: function resume(appData) {
      logger.debug('resume()');

      if (this._closed) {
        logger.error('resume() | Producer closed');
        return false;
      } else if (!this._locallyPaused) {
        return true;
      }

      this._locallyPaused = false;
      if (!this._remotelyPaused) this._track.enabled = true;
      if (this._transport) this._transport.resumeProducer(this, appData);
      this.safeEmit('resume', 'local', appData); // Return true if not paused.

      return !this.paused;
    }
    /**
     * My remote Producer was resumed.
     * Invoked via remote notification.
     *
     * @private
     *
     * @param {Any} [appData] - App custom data.
     */

  }, {
    key: "remoteResume",
    value: function remoteResume(appData) {
      logger.debug('remoteResume()');
      if (this._closed || !this._remotelyPaused) return;
      this._remotelyPaused = false;
      if (!this._locallyPaused) this._track.enabled = true;
      this.safeEmit('resume', 'remote', appData);
    }
    /**
     * Replaces the current track with a new one.
     *
     * @param {MediaStreamTrack} track - New track.
     *
     * @return {Promise} Resolves with the new track itself.
     */

  }, {
    key: "replaceTrack",
    value: function replaceTrack(track) {
      var _this3 = this;

      logger.debug('replaceTrack() [track:%o]', track);
      if (this._closed) return Promise.reject(new _errors.InvalidStateError('Producer closed'));else if (!track) return Promise.reject(new TypeError('no track given'));else if (track.readyState === 'ended') return Promise.reject(new Error('track.readyState is "ended"'));
      var clonedTrack;

      try {
        clonedTrack = track.clone();
      } catch (error) {
        clonedTrack = track;
      }

      return Promise.resolve().then(function () {
        // If this Producer is handled by a Transport, we need to tell it about
        // the new track.
        if (_this3._transport) return _this3._transport.replaceProducerTrack(_this3, clonedTrack);
      }).then(function () {
        // Stop the previous track.
        try {
          _this3._track.onended = null;

          _this3._track.stop();
        } catch (error) {} // If this Producer was locally paused/resumed and the state of the new
        // track does not match, fix it.


        if (!_this3.paused) clonedTrack.enabled = true;else clonedTrack.enabled = false; // Set the new tracks.

        _this3._originalTrack = track;
        _this3._track = clonedTrack; // Handle the effective track.

        _this3._handleTrack(); // Return the new track.


        return _this3._track;
      });
    }
    /**
     * Set/update RTP parameters.
     *
     * @private
     *
     * @param {RTCRtpParameters} rtpParameters
     */

  }, {
    key: "setRtpParameters",
    value: function setRtpParameters(rtpParameters) {
      this._rtpParameters = rtpParameters;
    }
    /**
     * Enables periodic stats retrieval.
     */

  }, {
    key: "enableStats",
    value: function enableStats() {
      var interval = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : DEFAULT_STATS_INTERVAL;
      logger.debug('enableStats() [interval:%s]', interval);

      if (this._closed) {
        logger.error('enableStats() | Producer closed');
        return;
      }

      if (this._statsEnabled) return;
      if (typeof interval !== 'number' || interval < 1000) this._statsInterval = DEFAULT_STATS_INTERVAL;else this._statsInterval = interval;
      this._statsEnabled = true;
      if (this._transport) this._transport.enableProducerStats(this, this._statsInterval);
    }
    /**
     * Disables periodic stats retrieval.
     */

  }, {
    key: "disableStats",
    value: function disableStats() {
      logger.debug('disableStats()');

      if (this._closed) {
        logger.error('disableStats() | Producer closed');
        return;
      }

      if (!this._statsEnabled) return;
      this._statsEnabled = false;
      if (this._transport) this._transport.disableProducerStats(this);
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
    /**
     * @private
     */

  }, {
    key: "_handleTrack",
    value: function _handleTrack() {
      var _this4 = this;

      // If the cloned track is closed (for example if the desktop sharing is closed
      // via chrome UI) notify the app and let it decide wheter to close the Producer
      // or not.
      this._track.onended = function () {
        if (_this4._closed) return;
        logger.warn('track "ended" event');

        _this4.safeEmit('trackended');
      };
    }
  }, {
    key: "id",
    get: function get() {
      return this._id;
    }
    /**
     * Whether the Producer is closed.
     *
     * @return {Boolean}
     */

  }, {
    key: "closed",
    get: function get() {
      return this._closed;
    }
    /**
     * Media kind.
     *
     * @return {String}
     */

  }, {
    key: "kind",
    get: function get() {
      return this._track.kind;
    }
    /**
     * The associated track.
     *
     * @return {MediaStreamTrack}
     */

  }, {
    key: "track",
    get: function get() {
      return this._track;
    }
    /**
     * The associated original track.
     *
     * @return {MediaStreamTrack}
     */

  }, {
    key: "originalTrack",
    get: function get() {
      return this._originalTrack;
    }
    /**
     * Simulcast settings.
     *
     * @return {Object|false}
     */

  }, {
    key: "simulcast",
    get: function get() {
      return this._simulcast;
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
     * Associated Transport.
     *
     * @return {Transport}
     */

  }, {
    key: "transport",
    get: function get() {
      return this._transport;
    }
    /**
     * RTP parameters.
     *
     * @return {RTCRtpParameters}
     */

  }, {
    key: "rtpParameters",
    get: function get() {
      return this._rtpParameters;
    }
    /**
     * Whether the Producer is locally paused.
     *
     * @return {Boolean}
     */

  }, {
    key: "locallyPaused",
    get: function get() {
      return this._locallyPaused;
    }
    /**
     * Whether the Producer is remotely paused.
     *
     * @return {Boolean}
     */

  }, {
    key: "remotelyPaused",
    get: function get() {
      return this._remotelyPaused;
    }
    /**
     * Whether the Producer is paused.
     *
     * @return {Boolean}
     */

  }, {
    key: "paused",
    get: function get() {
      return this._locallyPaused || this._remotelyPaused;
    }
  }]);

  return Producer;
}(_EnhancedEventEmitter2["default"]);

exports["default"] = Producer;