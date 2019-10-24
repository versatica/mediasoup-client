"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _Logger = _interopRequireDefault(require("./Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("./EnhancedEventEmitter"));

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

var PROFILES = new Set(['default', 'low', 'medium', 'high']);
var DEFAULT_STATS_INTERVAL = 1000;
var logger = new _Logger["default"]('Consumer');

var Consumer =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Consumer, _EnhancedEventEmitter);

  /**
   * @private
   *
   * @emits {originator: String, [appData]: Any} pause
   * @emits {originator: String, [appData]: Any} resume
   * @emits {profile: String} effectiveprofilechange
   * @emits {stats: Object} stats
   * @emits handled
   * @emits unhandled
   * @emits {originator: String} close
   *
   * @emits @close
   */
  function Consumer(id, kind, rtpParameters, peer, appData) {
    var _this;

    _classCallCheck(this, Consumer);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Consumer).call(this, logger)); // Id.
    // @type {Number}

    _this._id = id; // Closed flag.
    // @type {Boolean}

    _this._closed = false; // Media kind.
    // @type {String}

    _this._kind = kind; // RTP parameters.
    // @type {RTCRtpParameters}

    _this._rtpParameters = rtpParameters; // Associated Peer.
    // @type {Peer}

    _this._peer = peer; // App custom data.
    // @type {Any}

    _this._appData = appData; // Whether we can receive this Consumer (based on our RTP capabilities).
    // @type {Boolean}

    _this._supported = false; // Associated Transport.
    // @type {Transport}

    _this._transport = null; // Remote track.
    // @type {MediaStreamTrack}

    _this._track = null; // Locally paused flag.
    // @type {Boolean}

    _this._locallyPaused = false; // Remotely paused flag.
    // @type {Boolean}

    _this._remotelyPaused = false; // Periodic stats flag.
    // @type {Boolean}

    _this._statsEnabled = false; // Periodic stats gathering interval (milliseconds).
    // @type {Number}

    _this._statsInterval = DEFAULT_STATS_INTERVAL; // Preferred profile.
    // @type {String}

    _this._preferredProfile = 'default'; // Effective profile.
    // @type {String}

    _this._effectiveProfile = null;
    return _this;
  }
  /**
   * Consumer id.
   *
   * @return {Number}
   */


  _createClass(Consumer, [{
    key: "close",

    /**
     * Closes the Consumer.
     * This is called when the local Room is closed.
     *
     * @private
     */
    value: function close() {
      logger.debug('close()');
      if (this._closed) return;
      this._closed = true;

      if (this._statsEnabled) {
        this._statsEnabled = false;
        if (this.transport) this.transport.disableConsumerStats(this);
      }

      this.emit('@close');
      this.safeEmit('close', 'local');

      this._destroy();
    }
    /**
     * My remote Consumer was closed.
     * Invoked via remote notification.
     *
     * @private
     */

  }, {
    key: "remoteClose",
    value: function remoteClose() {
      logger.debug('remoteClose()');
      if (this._closed) return;
      this._closed = true;
      if (this._transport) this._transport.removeConsumer(this);

      this._destroy();

      this.emit('@close');
      this.safeEmit('close', 'remote');
    }
  }, {
    key: "_destroy",
    value: function _destroy() {
      this._transport = null;

      try {
        this._track.stop();
      } catch (error) {}

      this._track = null;
    }
    /**
     * Receives RTP.
     *
     * @param {transport} Transport instance.
     *
     * @return {Promise} Resolves with a remote MediaStreamTrack.
     */

  }, {
    key: "receive",
    value: function receive(transport) {
      var _this2 = this;

      logger.debug('receive() [transport:%o]', transport);
      if (this._closed) return Promise.reject(new _errors.InvalidStateError('Consumer closed'));else if (!this._supported) return Promise.reject(new Error('unsupported codecs'));else if (this._transport) return Promise.reject(new Error('already handled by a Transport'));else if (_typeof(transport) !== 'object') return Promise.reject(new TypeError('invalid Transport'));
      this._transport = transport;
      return transport.addConsumer(this).then(function (track) {
        _this2._track = track; // If we were paused, disable the track.

        if (_this2.paused) track.enabled = false;
        transport.once('@close', function () {
          if (_this2._closed || _this2._transport !== transport) return;
          _this2._transport = null;

          try {
            _this2._track.stop();
          } catch (error) {}

          _this2._track = null;

          _this2.safeEmit('unhandled');
        });

        _this2.safeEmit('handled');

        if (_this2._statsEnabled) transport.enableConsumerStats(_this2, _this2._statsInterval);
        return track;
      })["catch"](function (error) {
        _this2._transport = null;
        throw error;
      });
    }
    /**
     * Pauses receiving media.
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
        logger.error('pause() | Consumer closed');
        return false;
      } else if (this._locallyPaused) {
        return true;
      }

      this._locallyPaused = true;
      if (this._track) this._track.enabled = false;
      if (this._transport) this._transport.pauseConsumer(this, appData);
      this.safeEmit('pause', 'local', appData); // Return true if really paused.

      return this.paused;
    }
    /**
     * My remote Consumer was paused.
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
      if (this._track) this._track.enabled = false;
      this.safeEmit('pause', 'remote', appData);
    }
    /**
     * Resumes receiving media.
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
        logger.error('resume() | Consumer closed');
        return false;
      } else if (!this._locallyPaused) {
        return true;
      }

      this._locallyPaused = false;
      if (this._track && !this._remotelyPaused) this._track.enabled = true;
      if (this._transport) this._transport.resumeConsumer(this, appData);
      this.safeEmit('resume', 'local', appData); // Return true if not paused.

      return !this.paused;
    }
    /**
     * My remote Consumer was resumed.
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
      if (this._track && !this._locallyPaused) this._track.enabled = true;
      this.safeEmit('resume', 'remote', appData);
    }
    /**
     * Set preferred receiving profile.
     *
     * @param {String} profile
     */

  }, {
    key: "setPreferredProfile",
    value: function setPreferredProfile(profile) {
      logger.debug('setPreferredProfile() [profile:%s]', profile);

      if (this._closed) {
        logger.error('setPreferredProfile() | Consumer closed');
        return;
      } else if (profile === this._preferredProfile) {
        return;
      } else if (!PROFILES.has(profile)) {
        logger.error('setPreferredProfile() | invalid profile "%s"', profile);
        return;
      }

      this._preferredProfile = profile;
      if (this._transport) this._transport.setConsumerPreferredProfile(this, this._preferredProfile);
    }
    /**
     * Preferred receiving profile was set on my remote Consumer.
     *
     * @param {String} profile
     */

  }, {
    key: "remoteSetPreferredProfile",
    value: function remoteSetPreferredProfile(profile) {
      logger.debug('remoteSetPreferredProfile() [profile:%s]', profile);
      if (this._closed || profile === this._preferredProfile) return;
      this._preferredProfile = profile;
    }
    /**
     * Effective receiving profile changed on my remote Consumer.
     *
     * @param {String} profile
     */

  }, {
    key: "remoteEffectiveProfileChanged",
    value: function remoteEffectiveProfileChanged(profile) {
      logger.debug('remoteEffectiveProfileChanged() [profile:%s]', profile);
      if (this._closed || profile === this._effectiveProfile) return;
      this._effectiveProfile = profile;
      this.safeEmit('effectiveprofilechange', this._effectiveProfile);
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
        logger.error('enableStats() | Consumer closed');
        return;
      }

      if (this._statsEnabled) return;
      if (typeof interval !== 'number' || interval < 1000) this._statsInterval = DEFAULT_STATS_INTERVAL;else this._statsInterval = interval;
      this._statsEnabled = true;
      if (this._transport) this._transport.enableConsumerStats(this, this._statsInterval);
    }
    /**
     * Disables periodic stats retrieval.
     */

  }, {
    key: "disableStats",
    value: function disableStats() {
      logger.debug('disableStats()');

      if (this._closed) {
        logger.error('disableStats() | Consumer closed');
        return;
      }

      if (!this._statsEnabled) return;
      this._statsEnabled = false;
      if (this._transport) this._transport.disableConsumerStats(this);
    }
    /**
     * Mark this Consumer as suitable for reception or not.
     *
     * @private
     *
     * @param {Boolean} flag
     */

  }, {
    key: "setSupported",
    value: function setSupported(flag) {
      this._supported = flag;
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
    key: "id",
    get: function get() {
      return this._id;
    }
    /**
     * Whether the Consumer is closed.
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
      return this._kind;
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
     * Associated Peer.
     *
     * @return {Peer}
     */

  }, {
    key: "peer",
    get: function get() {
      return this._peer;
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
     * Whether we can receive this Consumer (based on our RTP capabilities).
     *
     * @return {Boolean}
     */

  }, {
    key: "supported",
    get: function get() {
      return this._supported;
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
     * The associated track (if any yet).
     *
     * @return {MediaStreamTrack|null}
     */

  }, {
    key: "track",
    get: function get() {
      return this._track;
    }
    /**
     * Whether the Consumer is locally paused.
     *
     * @return {Boolean}
     */

  }, {
    key: "locallyPaused",
    get: function get() {
      return this._locallyPaused;
    }
    /**
     * Whether the Consumer is remotely paused.
     *
     * @return {Boolean}
     */

  }, {
    key: "remotelyPaused",
    get: function get() {
      return this._remotelyPaused;
    }
    /**
     * Whether the Consumer is paused.
     *
     * @return {Boolean}
     */

  }, {
    key: "paused",
    get: function get() {
      return this._locallyPaused || this._remotelyPaused;
    }
    /**
     * The preferred profile.
     *
     * @type {String}
     */

  }, {
    key: "preferredProfile",
    get: function get() {
      return this._preferredProfile;
    }
    /**
     * The effective profile.
     *
     * @type {String}
     */

  }, {
    key: "effectiveProfile",
    get: function get() {
      return this._effectiveProfile;
    }
  }]);

  return Consumer;
}(_EnhancedEventEmitter2["default"]);

exports["default"] = Consumer;