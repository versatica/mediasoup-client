"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _Logger = _interopRequireDefault(require("./Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("./EnhancedEventEmitter"));

var _errors = require("./errors");

var ortc = _interopRequireWildcard(require("./ortc"));

var _Device = _interopRequireDefault(require("./Device"));

var _Transport = _interopRequireDefault(require("./Transport"));

var _Producer = _interopRequireDefault(require("./Producer"));

var _Peer = _interopRequireDefault(require("./Peer"));

var _Consumer = _interopRequireDefault(require("./Consumer"));

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

var logger = new _Logger["default"]('Room');
var RoomState = {
  "new": 'new',
  joining: 'joining',
  joined: 'joined',
  closed: 'closed'
};
/**
 * An instance of Room represents a remote multi conference and a local
 * peer that joins it.
 */

var Room =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Room, _EnhancedEventEmitter);

  /**
   * Room class.
   *
   * @param {Object} [options]
   * @param {Object} [options.roomSettings] Remote room settings, including its RTP
   * capabilities, mandatory codecs, etc. If given, no 'queryRoom' request is sent
   * to the server to discover them.
   * @param {Number} [options.requestTimeout=10000] - Timeout for sent requests
   * (in milliseconds). Defaults to 10000 (10 seconds).
   * @param {Object} [options.transportOptions] - Options for Transport created in mediasoup.
   * @param {Array<RTCIceServer>} [options.turnServers] - Array of TURN servers.
   * @param {RTCIceTransportPolicy} [options.iceTransportPolicy] - ICE transport policy.
   * @param {Number} [options.rtcAudioJitterBufferMaxPackets]
   * @param {Number} [options.rtcAudioJitterBufferMinDelayMs]
   * @param {Boolean} [options.spy] - Whether this is a spy peer.
   *
   * @throws {Error} if device is not supported.
   *
   * @emits {request: Object, callback: Function, errback: Function} request
   * @emits {notification: Object} notify
   * @emits {peer: Peer} newpeer
   * @emits {originator: String, [appData]: Any} close
   */
  function Room(options) {
    var _this;

    _classCallCheck(this, Room);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Room).call(this, logger));
    logger.debug('constructor() [options:%o]', options);
    if (!_Device["default"].isSupported()) throw new Error('current browser/device not supported');
    options = options || {}; // Computed settings.
    // @type {Object}

    _this._settings = {
      roomSettings: options.roomSettings,
      requestTimeout: options.requestTimeout || 30000,
      transportOptions: options.transportOptions || {},
      turnServers: options.turnServers || [],
      iceTransportPolicy: options.iceTransportPolicy || 'all',
      rtcAudioJitterBufferMaxPackets: options.rtcAudioJitterBufferMaxPackets,
      rtcAudioJitterBufferMinDelayMs: options.rtcAudioJitterBufferMinDelayMs,
      spy: Boolean(options.spy)
    }; // Room state.
    // @type {Boolean}

    _this._state = RoomState["new"]; // My mediasoup Peer name.
    // @type {String}

    _this._peerName = null; // Map of Transports indexed by id.
    // @type {map<Number, Transport>}

    _this._transports = new Map(); // Map of Producers indexed by id.
    // @type {map<Number, Producer>}

    _this._producers = new Map(); // Map of Peers indexed by name.
    // @type {map<String, Peer>}

    _this._peers = new Map(); // Extended RTP capabilities.
    // @type {Object}

    _this._extendedRtpCapabilities = null; // Whether we can send audio/video based on computed extended RTP
    // capabilities.
    // @type {Object}

    _this._canSendByKind = {
      audio: false,
      video: false
    };
    return _this;
  }
  /**
   * Whether the Room is joined.
   *
   * @return {Boolean}
   */


  _createClass(Room, [{
    key: "getTransportById",

    /**
     * Get the Transport with the given id.
     *
     * @param {Number} id
     *
     * @return {Transport}
     */
    value: function getTransportById(id) {
      return this._transports.get(id);
    }
    /**
     * Get the Producer with the given id.
     *
     * @param {Number} id
     *
     * @return {Producer}
     */

  }, {
    key: "getProducerById",
    value: function getProducerById(id) {
      return this._producers.get(id);
    }
    /**
     * Get the Peer with the given name.
     *
     * @param {String} name
     *
     * @return {Peer}
     */

  }, {
    key: "getPeerByName",
    value: function getPeerByName(name) {
      return this._peers.get(name);
    }
    /**
     * Start the procedures to join a remote room.
     * @param {String} peerName - My mediasoup Peer name.
     * @param {Any} [appData] - App custom data.
     * @return {Promise}
     */

  }, {
    key: "join",
    value: function join(peerName, appData) {
      var _this2 = this;

      logger.debug('join() [peerName:"%s"]', peerName);
      if (typeof peerName !== 'string') return Promise.reject(new TypeError('invalid peerName'));

      if (this._state !== RoomState["new"] && this._state !== RoomState.closed) {
        return Promise.reject(new _errors.InvalidStateError("invalid state \"".concat(this._state, "\"")));
      }

      this._peerName = peerName;
      this._state = RoomState.joining;
      var roomSettings;
      return Promise.resolve().then(function () {
        // If Room settings are provided don't query them.
        if (_this2._settings.roomSettings) {
          roomSettings = _this2._settings.roomSettings;
          return;
        } else {
          return _this2._sendRequest('queryRoom', {
            target: 'room'
          }).then(function (response) {
            roomSettings = response;
            logger.debug('join() | got Room settings:%o', roomSettings);
          });
        }
      }).then(function () {
        return _Device["default"].Handler.getNativeRtpCapabilities();
      }).then(function (nativeRtpCapabilities) {
        logger.debug('join() | native RTP capabilities:%o', nativeRtpCapabilities); // Get extended RTP capabilities.

        _this2._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(nativeRtpCapabilities, roomSettings.rtpCapabilities);
        logger.debug('join() | extended RTP capabilities:%o', _this2._extendedRtpCapabilities); // Check unsupported codecs.

        var unsupportedRoomCodecs = ortc.getUnsupportedCodecs(roomSettings.rtpCapabilities, roomSettings.mandatoryCodecPayloadTypes, _this2._extendedRtpCapabilities);

        if (unsupportedRoomCodecs.length > 0) {
          logger.error('%s mandatory room codecs not supported:%o', unsupportedRoomCodecs.length, unsupportedRoomCodecs);
          throw new _errors.UnsupportedError('mandatory room codecs not supported', unsupportedRoomCodecs);
        } // Check whether we can send audio/video.


        _this2._canSendByKind.audio = ortc.canSend('audio', _this2._extendedRtpCapabilities);
        _this2._canSendByKind.video = ortc.canSend('video', _this2._extendedRtpCapabilities); // Generate our effective RTP capabilities for receiving media.

        var effectiveLocalRtpCapabilities = ortc.getRtpCapabilities(_this2._extendedRtpCapabilities);
        logger.debug('join() | effective local RTP capabilities for receiving:%o', effectiveLocalRtpCapabilities);
        var data = {
          target: 'room',
          peerName: _this2._peerName,
          rtpCapabilities: effectiveLocalRtpCapabilities,
          spy: _this2._settings.spy,
          appData: appData
        };
        return _this2._sendRequest('join', data).then(function (response) {
          return response.peers;
        });
      }).then(function (peers) {
        // Handle Peers already existing in the room.
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = (peers || [])[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var peerData = _step.value;

            try {
              _this2._handlePeerData(peerData);
            } catch (error) {
              logger.error('join() | error handling Peer:%o', error);
            }
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

        _this2._state = RoomState.joined;
        logger.debug('join() | joined the Room'); // Return the list of already existing Peers.

        return _this2.peers;
      })["catch"](function (error) {
        _this2._state = RoomState["new"];
        throw error;
      });
    }
    /**
     * Leave the Room.
     *
     * @param {Any} [appData] - App custom data.
     */

  }, {
    key: "leave",
    value: function leave(appData) {
      logger.debug('leave()');
      if (this.closed) return; // Send a notification.

      this._sendNotification('leave', {
        appData: appData
      }); // Set closed state after sending the notification (otherwise the
      // notification won't be sent).


      this._state = RoomState.closed;
      this.safeEmit('close', 'local', appData); // Close all the Transports.

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = this._transports.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var transport = _step2.value;
          transport.close();
        } // Close all the Producers.

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

      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = this._producers.values()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var producer = _step3.value;
          producer.close();
        } // Close all the Peers.

      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
            _iterator3["return"]();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = this._peers.values()[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var peer = _step4.value;
          peer.close();
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
            _iterator4["return"]();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }
    }
    /**
     * The remote Room was closed or our remote Peer has been closed.
     * Invoked via remote notification or via API.
     *
     * @param {Any} [appData] - App custom data.
     */

  }, {
    key: "remoteClose",
    value: function remoteClose(appData) {
      logger.debug('remoteClose()');
      if (this.closed) return;
      this._state = RoomState.closed;
      this.safeEmit('close', 'remote', appData); // Close all the Transports.

      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = this._transports.values()[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var transport = _step5.value;
          transport.remoteClose(null, {
            destroy: true
          });
        } // Close all the Producers.

      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5["return"] != null) {
            _iterator5["return"]();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }

      var _iteratorNormalCompletion6 = true;
      var _didIteratorError6 = false;
      var _iteratorError6 = undefined;

      try {
        for (var _iterator6 = this._producers.values()[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
          var producer = _step6.value;
          producer.remoteClose();
        } // Close all the Peers.

      } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion6 && _iterator6["return"] != null) {
            _iterator6["return"]();
          }
        } finally {
          if (_didIteratorError6) {
            throw _iteratorError6;
          }
        }
      }

      var _iteratorNormalCompletion7 = true;
      var _didIteratorError7 = false;
      var _iteratorError7 = undefined;

      try {
        for (var _iterator7 = this._peers.values()[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
          var peer = _step7.value;
          peer.remoteClose();
        }
      } catch (err) {
        _didIteratorError7 = true;
        _iteratorError7 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion7 && _iterator7["return"] != null) {
            _iterator7["return"]();
          }
        } finally {
          if (_didIteratorError7) {
            throw _iteratorError7;
          }
        }
      }
    }
    /**
     * Whether we can send audio/video.
     *
     * @param {String} kind - 'audio' or 'video'.
     *
     * @return {Boolean}
     */

  }, {
    key: "canSend",
    value: function canSend(kind) {
      if (kind !== 'audio' && kind !== 'video') throw new TypeError("invalid kind \"".concat(kind, "\""));
      if (!this.joined || this._settings.spy) return false;
      return this._canSendByKind[kind];
    }
    /**
     * Creates a Transport.
     *
     * @param {String} direction - Must be 'send' or 'recv'.
     * @param {Any} [appData] - App custom data.
     *
     * @return {Transport}
     *
     * @throws {InvalidStateError} if not joined.
     * @throws {TypeError} if wrong arguments.
     */

  }, {
    key: "createTransport",
    value: function createTransport(direction, appData) {
      var _this3 = this;

      logger.debug('createTransport() [direction:%s]', direction);
      if (!this.joined) throw new _errors.InvalidStateError("invalid state \"".concat(this._state, "\""));else if (direction !== 'send' && direction !== 'recv') throw new TypeError("invalid direction \"".concat(direction, "\""));else if (direction === 'send' && this._settings.spy) throw new TypeError('a spy peer cannot send media to the room'); // Create a new Transport.

      var transport = new _Transport["default"](direction, this._extendedRtpCapabilities, this._settings, appData); // Store it.

      this._transports.set(transport.id, transport);

      transport.on('@request', function (method, data, callback, errback) {
        _this3._sendRequest(method, data).then(callback)["catch"](errback);
      });
      transport.on('@notify', function (method, data) {
        _this3._sendNotification(method, data);
      });
      transport.on('@close', function () {
        _this3._transports["delete"](transport.id);
      });
      return transport;
    }
    /**
     * Creates a Producer.
     *
     * @param {MediaStreamTrack} track
     * @param {Object} [options]
     * @param {Object} [options.simulcast]
     * @param {Any} [appData] - App custom data.
     *
     * @return {Producer}
     *
     * @throws {InvalidStateError} if not joined.
     * @throws {TypeError} if wrong arguments.
     * @throws {Error} if cannot send the given kindor we are a spy peer.
     */

  }, {
    key: "createProducer",
    value: function createProducer(track, options, appData) {
      var _this4 = this;

      logger.debug('createProducer() [track:%o, options:%o]', track, options);
      if (!this.joined) throw new _errors.InvalidStateError("invalid state \"".concat(this._state, "\""));else if (this._settings.spy) throw new Error('a spy peer cannot send media to the room');else if (!track) throw new TypeError('no track given');else if (!this._canSendByKind[track.kind]) throw new Error("cannot send ".concat(track.kind));else if (track.readyState === 'ended') throw new Error('track.readyState is "ended"');
      options = options || {}; // Create a new Producer.

      var producer = new _Producer["default"](track, options, appData); // Store it.

      this._producers.set(producer.id, producer);

      producer.on('@close', function () {
        _this4._producers["delete"](producer.id);
      });
      return producer;
    }
    /**
     * Produce a ICE restart in all the Transports.
     */

  }, {
    key: "restartIce",
    value: function restartIce() {
      if (!this.joined) {
        logger.warn("restartIce() | invalid state \"".concat(this._state, "\""));
        return;
      }

      var _iteratorNormalCompletion8 = true;
      var _didIteratorError8 = false;
      var _iteratorError8 = undefined;

      try {
        for (var _iterator8 = this._transports.values()[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
          var transport = _step8.value;
          transport.restartIce();
        }
      } catch (err) {
        _didIteratorError8 = true;
        _iteratorError8 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion8 && _iterator8["return"] != null) {
            _iterator8["return"]();
          }
        } finally {
          if (_didIteratorError8) {
            throw _iteratorError8;
          }
        }
      }
    }
    /**
     * Provide the local Room with a notification generated by mediasoup server.
     *
     * @param {Object} notification
     */

  }, {
    key: "receiveNotification",
    value: function receiveNotification(notification) {
      var _this5 = this;

      if (this.closed) return Promise.reject(new _errors.InvalidStateError('Room closed'));else if (_typeof(notification) !== 'object') return Promise.reject(new TypeError('wrong notification Object'));else if (notification.notification !== true) return Promise.reject(new TypeError('not a notification'));else if (typeof notification.method !== 'string') return Promise.reject(new TypeError('wrong/missing notification method'));
      var method = notification.method;
      logger.debug('receiveNotification() [method:%s, notification:%o]', method, notification);
      return Promise.resolve().then(function () {
        switch (method) {
          case 'closed':
            {
              var appData = notification.appData;

              _this5.remoteClose(appData);

              break;
            }

          case 'transportClosed':
            {
              var id = notification.id,
                  _appData = notification.appData;

              var transport = _this5._transports.get(id);

              if (!transport) throw new Error("Transport not found [id:\"".concat(id, "\"]"));
              transport.remoteClose(_appData, {
                destroy: false
              });
              break;
            }

          case 'transportStats':
            {
              var _id = notification.id,
                  stats = notification.stats;

              var _transport = _this5._transports.get(_id);

              if (!_transport) throw new Error("Transport not found [id:".concat(_id, "]"));

              _transport.remoteStats(stats);

              break;
            }

          case 'newPeer':
            {
              var name = notification.name;
              if (_this5._peers.has(name)) throw new Error("Peer already exists [name:\"".concat(name, "\"]"));
              var peerData = notification;

              _this5._handlePeerData(peerData);

              break;
            }

          case 'peerClosed':
            {
              var peerName = notification.name;
              var _appData2 = notification.appData;

              var peer = _this5._peers.get(peerName);

              if (!peer) throw new Error("no Peer found [name:\"".concat(peerName, "\"]"));
              peer.remoteClose(_appData2);
              break;
            }

          case 'producerPaused':
            {
              var _id2 = notification.id,
                  _appData3 = notification.appData;

              var producer = _this5._producers.get(_id2);

              if (!producer) throw new Error("Producer not found [id:".concat(_id2, "]"));
              producer.remotePause(_appData3);
              break;
            }

          case 'producerResumed':
            {
              var _id3 = notification.id,
                  _appData4 = notification.appData;

              var _producer = _this5._producers.get(_id3);

              if (!_producer) throw new Error("Producer not found [id:".concat(_id3, "]"));

              _producer.remoteResume(_appData4);

              break;
            }

          case 'producerClosed':
            {
              var _id4 = notification.id,
                  _appData5 = notification.appData;

              var _producer2 = _this5._producers.get(_id4);

              if (!_producer2) throw new Error("Producer not found [id:".concat(_id4, "]"));

              _producer2.remoteClose(_appData5);

              break;
            }

          case 'producerStats':
            {
              var _id5 = notification.id,
                  _stats = notification.stats;

              var _producer3 = _this5._producers.get(_id5);

              if (!_producer3) throw new Error("Producer not found [id:".concat(_id5, "]"));

              _producer3.remoteStats(_stats);

              break;
            }

          case 'newConsumer':
            {
              var _peerName = notification.peerName;

              var _peer = _this5._peers.get(_peerName);

              if (!_peer) throw new Error("no Peer found [name:\"".concat(_peerName, "\"]"));
              var consumerData = notification;

              _this5._handleConsumerData(consumerData, _peer);

              break;
            }

          case 'consumerClosed':
            {
              var _id6 = notification.id,
                  _peerName2 = notification.peerName,
                  _appData6 = notification.appData;

              var _peer2 = _this5._peers.get(_peerName2);

              if (!_peer2) throw new Error("no Peer found [name:\"".concat(_peerName2, "\"]"));

              var consumer = _peer2.getConsumerById(_id6);

              if (!consumer) throw new Error("Consumer not found [id:".concat(_id6, "]"));
              consumer.remoteClose(_appData6);
              break;
            }

          case 'consumerPaused':
            {
              var _id7 = notification.id,
                  _peerName3 = notification.peerName,
                  _appData7 = notification.appData;

              var _peer3 = _this5._peers.get(_peerName3);

              if (!_peer3) throw new Error("no Peer found [name:\"".concat(_peerName3, "\"]"));

              var _consumer = _peer3.getConsumerById(_id7);

              if (!_consumer) throw new Error("Consumer not found [id:".concat(_id7, "]"));

              _consumer.remotePause(_appData7);

              break;
            }

          case 'consumerResumed':
            {
              var _id8 = notification.id,
                  _peerName4 = notification.peerName,
                  _appData8 = notification.appData;

              var _peer4 = _this5._peers.get(_peerName4);

              if (!_peer4) throw new Error("no Peer found [name:\"".concat(_peerName4, "\"]"));

              var _consumer2 = _peer4.getConsumerById(_id8);

              if (!_consumer2) throw new Error("Consumer not found [id:".concat(_id8, "]"));

              _consumer2.remoteResume(_appData8);

              break;
            }

          case 'consumerPreferredProfileSet':
            {
              var _id9 = notification.id,
                  _peerName5 = notification.peerName,
                  profile = notification.profile;

              var _peer5 = _this5._peers.get(_peerName5);

              if (!_peer5) throw new Error("no Peer found [name:\"".concat(_peerName5, "\"]"));

              var _consumer3 = _peer5.getConsumerById(_id9);

              if (!_consumer3) throw new Error("Consumer not found [id:".concat(_id9, "]"));

              _consumer3.remoteSetPreferredProfile(profile);

              break;
            }

          case 'consumerEffectiveProfileChanged':
            {
              var _id10 = notification.id,
                  _peerName6 = notification.peerName,
                  _profile = notification.profile;

              var _peer6 = _this5._peers.get(_peerName6);

              if (!_peer6) throw new Error("no Peer found [name:\"".concat(_peerName6, "\"]"));

              var _consumer4 = _peer6.getConsumerById(_id10);

              if (!_consumer4) throw new Error("Consumer not found [id:".concat(_id10, "]"));

              _consumer4.remoteEffectiveProfileChanged(_profile);

              break;
            }

          case 'consumerStats':
            {
              var _id11 = notification.id,
                  _peerName7 = notification.peerName,
                  _stats2 = notification.stats;

              var _peer7 = _this5._peers.get(_peerName7);

              if (!_peer7) throw new Error("no Peer found [name:\"".concat(_peerName7, "\"]"));

              var _consumer5 = _peer7.getConsumerById(_id11);

              if (!_consumer5) throw new Error("Consumer not found [id:".concat(_id11, "]"));

              _consumer5.remoteStats(_stats2);

              break;
            }

          default:
            throw new Error("unknown notification method \"".concat(method, "\""));
        }
      })["catch"](function (error) {
        logger.error('receiveNotification() failed [notification:%o]: %s', notification, error);
      });
    }
  }, {
    key: "_sendRequest",
    value: function _sendRequest(method, data) {
      var _this6 = this;

      var request = Object.assign({
        method: method,
        target: 'peer'
      }, data); // Should never happen.
      // Ignore if closed.

      if (this.closed) {
        logger.error('_sendRequest() | Room closed [method:%s, request:%o]', method, request);
        return Promise.reject(new _errors.InvalidStateError('Room closed'));
      }

      logger.debug('_sendRequest() [method:%s, request:%o]', method, request);
      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          logger.error('request failed [method:%s]: timeout', method);
          done = true;
          reject(new _errors.TimeoutError('timeout'));
        }, _this6._settings.requestTimeout);

        var callback = function callback(response) {
          if (done) return;
          done = true;
          clearTimeout(timer);

          if (_this6.closed) {
            logger.error('request failed [method:%s]: Room closed', method);
            reject(new Error('Room closed'));
            return;
          }

          logger.debug('request succeeded [method:%s, response:%o]', method, response);
          resolve(response);
        };

        var errback = function errback(error) {
          if (done) return;
          done = true;
          clearTimeout(timer);

          if (_this6.closed) {
            logger.error('request failed [method:%s]: Room closed', method);
            reject(new Error('Room closed'));
            return;
          } // Make sure message is an Error.


          if (!(error instanceof Error)) error = new Error(String(error));
          logger.error('request failed [method:%s]:%o', method, error);
          reject(error);
        };

        _this6.safeEmit('request', request, callback, errback);
      });
    }
  }, {
    key: "_sendNotification",
    value: function _sendNotification(method, data) {
      // Ignore if closed.
      if (this.closed) return;
      var notification = Object.assign({
        method: method,
        target: 'peer',
        notification: true
      }, data);
      logger.debug('_sendNotification() [method:%s, notification:%o]', method, notification);
      this.safeEmit('notify', notification);
    }
  }, {
    key: "_handlePeerData",
    value: function _handlePeerData(peerData) {
      var _this7 = this;

      var name = peerData.name,
          consumers = peerData.consumers,
          appData = peerData.appData;
      var peer = new _Peer["default"](name, appData); // Store it.

      this._peers.set(peer.name, peer);

      peer.on('@close', function () {
        _this7._peers["delete"](peer.name);
      }); // Add consumers.

      var _iteratorNormalCompletion9 = true;
      var _didIteratorError9 = false;
      var _iteratorError9 = undefined;

      try {
        for (var _iterator9 = consumers[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
          var consumerData = _step9.value;

          try {
            this._handleConsumerData(consumerData, peer);
          } catch (error) {
            logger.error('error handling existing Consumer in Peer:%o', error);
          }
        } // If already joined emit event.

      } catch (err) {
        _didIteratorError9 = true;
        _iteratorError9 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion9 && _iterator9["return"] != null) {
            _iterator9["return"]();
          }
        } finally {
          if (_didIteratorError9) {
            throw _iteratorError9;
          }
        }
      }

      if (this.joined) this.safeEmit('newpeer', peer);
    }
  }, {
    key: "_handleConsumerData",
    value: function _handleConsumerData(producerData, peer) {
      var id = producerData.id,
          kind = producerData.kind,
          rtpParameters = producerData.rtpParameters,
          paused = producerData.paused,
          appData = producerData.appData;
      var consumer = new _Consumer["default"](id, kind, rtpParameters, peer, appData);
      var supported = ortc.canReceive(consumer.rtpParameters, this._extendedRtpCapabilities);
      if (supported) consumer.setSupported(true);
      if (paused) consumer.remotePause();
      peer.addConsumer(consumer);
    }
  }, {
    key: "joined",
    get: function get() {
      return this._state === RoomState.joined;
    }
    /**
     * Whether the Room is closed.
     *
     * @return {Boolean}
     */

  }, {
    key: "closed",
    get: function get() {
      return this._state === RoomState.closed;
    }
    /**
     * My mediasoup Peer name.
     *
     * @return {String}
     */

  }, {
    key: "peerName",
    get: function get() {
      return this._peerName;
    }
    /**
     * The list of Transports.
     *
     * @return {Array<Transport>}
     */

  }, {
    key: "transports",
    get: function get() {
      return Array.from(this._transports.values());
    }
    /**
     * The list of Producers.
     *
     * @return {Array<Producer>}
     */

  }, {
    key: "producers",
    get: function get() {
      return Array.from(this._producers.values());
    }
    /**
     * The list of Peers.
     *
     * @return {Array<Peer>}
     */

  }, {
    key: "peers",
    get: function get() {
      return Array.from(this._peers.values());
    }
  }]);

  return Room;
}(_EnhancedEventEmitter2["default"]);

exports["default"] = Room;