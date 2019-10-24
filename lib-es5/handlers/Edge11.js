"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _Logger = _interopRequireDefault(require("../Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("../EnhancedEventEmitter"));

var utils = _interopRequireWildcard(require("../utils"));

var ortc = _interopRequireWildcard(require("../ortc"));

var edgeUtils = _interopRequireWildcard(require("./ortc/edgeUtils"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var CNAME = "CNAME-EDGE-".concat(utils.randomNumber());
var logger = new _Logger["default"]('Edge11');

var Edge11 =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Edge11, _EnhancedEventEmitter);

  _createClass(Edge11, null, [{
    key: "getNativeRtpCapabilities",
    value: function getNativeRtpCapabilities() {
      logger.debug('getNativeRtpCapabilities()');
      return Promise.resolve(edgeUtils.getCapabilities());
    }
  }, {
    key: "tag",
    get: function get() {
      return 'Edge11';
    }
  }]);

  function Edge11(direction, extendedRtpCapabilities, settings) {
    var _this;

    _classCallCheck(this, Edge11);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Edge11).call(this, logger));
    logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]', direction, extendedRtpCapabilities); // Generic sending RTP parameters for audio and video.
    // @type {Object}

    _this._rtpParametersByKind = {
      audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
      video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
    }; // Got transport local and remote parameters.
    // @type {Boolean}

    _this._transportReady = false; // ICE gatherer.

    _this._iceGatherer = null; // ICE transport.

    _this._iceTransport = null; // DTLS transport.
    // @type {RTCDtlsTransport}

    _this._dtlsTransport = null; // Map of RTCRtpSenders indexed by Producer.id.
    // @type {Map<Number, RTCRtpSender}

    _this._rtpSenders = new Map(); // Map of RTCRtpReceivers indexed by Consumer.id.
    // @type {Map<Number, RTCRtpReceiver}

    _this._rtpReceivers = new Map(); // Remote Transport parameters.
    // @type {Object}

    _this._transportRemoteParameters = null;

    _this._setIceGatherer(settings);

    _this._setIceTransport();

    _this._setDtlsTransport();

    return _this;
  }

  _createClass(Edge11, [{
    key: "close",
    value: function close() {
      logger.debug('close()'); // Close the ICE gatherer.
      // NOTE: Not yet implemented by Edge.

      try {
        this._iceGatherer.close();
      } catch (error) {} // Close the ICE transport.


      try {
        this._iceTransport.stop();
      } catch (error) {} // Close the DTLS transport.


      try {
        this._dtlsTransport.stop();
      } catch (error) {} // Close RTCRtpSenders.


      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = this._rtpSenders.values()[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var rtpSender = _step.value;

          try {
            rtpSender.stop();
          } catch (error) {}
        } // Close RTCRtpReceivers.

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

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = this._rtpReceivers.values()[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var rtpReceiver = _step2.value;

          try {
            rtpReceiver.stop();
          } catch (error) {}
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
  }, {
    key: "remoteClosed",
    value: function remoteClosed() {
      logger.debug('remoteClosed()');
      this._transportReady = false;
    }
  }, {
    key: "addProducer",
    value: function addProducer(producer) {
      var _this2 = this;

      var track = producer.track;
      logger.debug('addProducer() [id:%s, kind:%s, trackId:%s]', producer.id, producer.kind, track.id);
      if (this._rtpSenders.has(producer.id)) return Promise.reject(new Error('Producer already added'));
      return Promise.resolve().then(function () {
        if (!_this2._transportReady) return _this2._setupTransport();
      }).then(function () {
        logger.debug('addProducer() | calling new RTCRtpSender()');
        var rtpSender = new RTCRtpSender(track, _this2._dtlsTransport);
        var rtpParameters = utils.clone(_this2._rtpParametersByKind[producer.kind]); // Fill RTCRtpParameters.encodings.

        var encoding = {
          ssrc: utils.randomNumber()
        };

        if (rtpParameters.codecs.some(function (codec) {
          return codec.name === 'rtx';
        })) {
          encoding.rtx = {
            ssrc: utils.randomNumber()
          };
        }

        rtpParameters.encodings.push(encoding); // Fill RTCRtpParameters.rtcp.

        rtpParameters.rtcp = {
          cname: CNAME,
          reducedSize: true,
          mux: true
        }; // NOTE: Convert our standard RTCRtpParameters into those that Edge
        // expects.

        var edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);
        logger.debug('addProducer() | calling rtpSender.send() [params:%o]', edgeRtpParameters);
        rtpSender.send(edgeRtpParameters); // Store it.

        _this2._rtpSenders.set(producer.id, rtpSender);

        return rtpParameters;
      });
    }
  }, {
    key: "removeProducer",
    value: function removeProducer(producer) {
      var _this3 = this;

      var track = producer.track;
      logger.debug('removeProducer() [id:%s, kind:%s, trackId:%s]', producer.id, producer.kind, track.id);
      return Promise.resolve().then(function () {
        var rtpSender = _this3._rtpSenders.get(producer.id);

        if (!rtpSender) throw new Error('RTCRtpSender not found');

        _this3._rtpSenders["delete"](producer.id);

        try {
          logger.debug('removeProducer() | calling rtpSender.stop()');
          rtpSender.stop();
        } catch (error) {
          logger.warn('rtpSender.stop() failed:%o', error);
        }
      });
    }
  }, {
    key: "replaceProducerTrack",
    value: function replaceProducerTrack(producer, track) {
      var _this4 = this;

      logger.debug('replaceProducerTrack() [id:%s, kind:%s, trackId:%s]', producer.id, producer.kind, track.id);
      return Promise.resolve().then(function () {
        var rtpSender = _this4._rtpSenders.get(producer.id);

        if (!rtpSender) throw new Error('RTCRtpSender not found');
        rtpSender.setTrack(track);
      });
    }
  }, {
    key: "addConsumer",
    value: function addConsumer(consumer) {
      var _this5 = this;

      logger.debug('addConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);
      if (this._rtpReceivers.has(consumer.id)) return Promise.reject(new Error('Consumer already added'));
      return Promise.resolve().then(function () {
        if (!_this5._transportReady) return _this5._setupTransport();
      }).then(function () {
        logger.debug('addConsumer() | calling new RTCRtpReceiver()');
        var rtpReceiver = new RTCRtpReceiver(_this5._dtlsTransport, consumer.kind);
        rtpReceiver.addEventListener('error', function (event) {
          logger.error('iceGatherer "error" event [event:%o]', event);
        }); // NOTE: Convert our standard RTCRtpParameters into those that Edge
        // expects.

        var edgeRtpParameters = edgeUtils.mangleRtpParameters(consumer.rtpParameters); // Ignore MID RTP extension for receiving media.

        edgeRtpParameters.headerExtensions = edgeRtpParameters.headerExtensions.filter(function (extension) {
          return extension.uri !== 'urn:ietf:params:rtp-hdrext:sdes:mid';
        });
        logger.debug('addConsumer() | calling rtpReceiver.receive() [params:%o]', edgeRtpParameters);
        rtpReceiver.receive(edgeRtpParameters); // Store it.

        _this5._rtpReceivers.set(consumer.id, rtpReceiver);

        return rtpReceiver.track;
      });
    }
  }, {
    key: "removeConsumer",
    value: function removeConsumer(consumer) {
      var _this6 = this;

      logger.debug('removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);
      return Promise.resolve().then(function () {
        var rtpReceiver = _this6._rtpReceivers.get(consumer.id);

        if (!rtpReceiver) throw new Error('RTCRtpReceiver not found');

        _this6._rtpReceivers["delete"](consumer.id);

        try {
          logger.debug('removeConsumer() | calling rtpReceiver.stop()');
          rtpReceiver.stop();
        } catch (error) {
          logger.warn('rtpReceiver.stop() failed:%o', error);
        }
      });
    }
  }, {
    key: "restartIce",
    value: function restartIce(remoteIceParameters) {
      var _this7 = this;

      logger.debug('restartIce()');
      Promise.resolve().then(function () {
        _this7._transportRemoteParameters.iceParameters = remoteIceParameters;
        var remoteIceCandidates = _this7._transportRemoteParameters.iceCandidates;
        logger.debug('restartIce() | calling iceTransport.start()');

        _this7._iceTransport.start(_this7._iceGatherer, remoteIceParameters, 'controlling');

        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = remoteIceCandidates[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var candidate = _step3.value;

            _this7._iceTransport.addRemoteCandidate(candidate);
          }
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

        _this7._iceTransport.addRemoteCandidate({});
      });
    }
  }, {
    key: "_setIceGatherer",
    value: function _setIceGatherer(settings) {
      var iceGatherer = new RTCIceGatherer({
        iceServers: settings.turnServers || [],
        gatherPolicy: settings.iceTransportPolicy
      });
      iceGatherer.addEventListener('error', function (event) {
        logger.error('iceGatherer "error" event [event:%o]', event);
      }); // NOTE: Not yet implemented by Edge, which starts gathering automatically.

      try {
        iceGatherer.gather();
      } catch (error) {
        logger.debug('iceGatherer.gather() failed: %s', error.toString());
      }

      this._iceGatherer = iceGatherer;
    }
  }, {
    key: "_setIceTransport",
    value: function _setIceTransport() {
      var _this8 = this;

      var iceTransport = new RTCIceTransport(this._iceGatherer); // NOTE: Not yet implemented by Edge.

      iceTransport.addEventListener('statechange', function () {
        switch (iceTransport.state) {
          case 'checking':
            _this8.emit('@connectionstatechange', 'connecting');

            break;

          case 'connected':
          case 'completed':
            _this8.emit('@connectionstatechange', 'connected');

            break;

          case 'failed':
            _this8.emit('@connectionstatechange', 'failed');

            break;

          case 'disconnected':
            _this8.emit('@connectionstatechange', 'disconnected');

            break;

          case 'closed':
            _this8.emit('@connectionstatechange', 'closed');

            break;
        }
      }); // NOTE: Not standard, but implemented by Edge.

      iceTransport.addEventListener('icestatechange', function () {
        switch (iceTransport.state) {
          case 'checking':
            _this8.emit('@connectionstatechange', 'connecting');

            break;

          case 'connected':
          case 'completed':
            _this8.emit('@connectionstatechange', 'connected');

            break;

          case 'failed':
            _this8.emit('@connectionstatechange', 'failed');

            break;

          case 'disconnected':
            _this8.emit('@connectionstatechange', 'disconnected');

            break;

          case 'closed':
            _this8.emit('@connectionstatechange', 'closed');

            break;
        }
      });
      iceTransport.addEventListener('candidatepairchange', function (event) {
        logger.debug('iceTransport "candidatepairchange" event [pair:%o]', event.pair);
      });
      this._iceTransport = iceTransport;
    }
  }, {
    key: "_setDtlsTransport",
    value: function _setDtlsTransport() {
      var _this9 = this;

      var dtlsTransport = new RTCDtlsTransport(this._iceTransport); // NOTE: Not yet implemented by Edge.

      dtlsTransport.addEventListener('statechange', function () {
        logger.debug('dtlsTransport "statechange" event [state:%s]', dtlsTransport.state);
      }); // NOTE: Not standard, but implemented by Edge.

      dtlsTransport.addEventListener('dtlsstatechange', function () {
        logger.debug('dtlsTransport "dtlsstatechange" event [state:%s]', dtlsTransport.state);
        if (dtlsTransport.state === 'closed') _this9.emit('@connectionstatechange', 'closed');
      });
      dtlsTransport.addEventListener('error', function (event) {
        logger.error('dtlsTransport "error" event [event:%o]', event);
      });
      this._dtlsTransport = dtlsTransport;
    }
  }, {
    key: "_setupTransport",
    value: function _setupTransport() {
      var _this10 = this;

      logger.debug('_setupTransport()');
      return Promise.resolve().then(function () {
        // Get our local DTLS parameters.
        var transportLocalParameters = {};

        var dtlsParameters = _this10._dtlsTransport.getLocalParameters(); // Let's decide that we'll be DTLS server (because we can).


        dtlsParameters.role = 'server';
        transportLocalParameters.dtlsParameters = dtlsParameters; // We need transport remote parameters.

        return _this10.safeEmitAsPromise('@needcreatetransport', transportLocalParameters);
      }).then(function (transportRemoteParameters) {
        _this10._transportRemoteParameters = transportRemoteParameters;
        var remoteIceParameters = transportRemoteParameters.iceParameters;
        var remoteIceCandidates = transportRemoteParameters.iceCandidates;
        var remoteDtlsParameters = transportRemoteParameters.dtlsParameters; // Start the RTCIceTransport.

        _this10._iceTransport.start(_this10._iceGatherer, remoteIceParameters, 'controlling'); // Add remote ICE candidates.


        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
          for (var _iterator4 = remoteIceCandidates[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
            var candidate = _step4.value;

            _this10._iceTransport.addRemoteCandidate(candidate);
          } // Also signal a 'complete' candidate as per spec.
          // NOTE: It should be {complete: true} but Edge prefers {}.
          // NOTE: If we don't signal end of candidates, the Edge RTCIceTransport
          // won't enter the 'completed' state.

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

        _this10._iceTransport.addRemoteCandidate({}); // NOTE: Edge does not like SHA less than 256.


        remoteDtlsParameters.fingerprints = remoteDtlsParameters.fingerprints.filter(function (fingerprint) {
          return fingerprint.algorithm === 'sha-256' || fingerprint.algorithm === 'sha-384' || fingerprint.algorithm === 'sha-512';
        }); // Start the RTCDtlsTransport.

        _this10._dtlsTransport.start(remoteDtlsParameters);

        _this10._transportReady = true;
      });
    }
  }]);

  return Edge11;
}(_EnhancedEventEmitter2["default"]);

exports["default"] = Edge11;