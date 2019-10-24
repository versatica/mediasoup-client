"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _sdpTransform = _interopRequireDefault(require("sdp-transform"));

var _Logger = _interopRequireDefault(require("../Logger"));

var _EnhancedEventEmitter2 = _interopRequireDefault(require("../EnhancedEventEmitter"));

var utils = _interopRequireWildcard(require("../utils"));

var ortc = _interopRequireWildcard(require("../ortc"));

var sdpCommonUtils = _interopRequireWildcard(require("./sdp/commonUtils"));

var sdpUnifiedPlanUtils = _interopRequireWildcard(require("./sdp/unifiedPlanUtils"));

var _RemoteUnifiedPlanSdp = _interopRequireDefault(require("./sdp/RemoteUnifiedPlanSdp"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

var logger = new _Logger["default"]('Firefox59');

var Handler =
/*#__PURE__*/
function (_EnhancedEventEmitter) {
  _inherits(Handler, _EnhancedEventEmitter);

  function Handler(direction, rtpParametersByKind, settings) {
    var _this;

    _classCallCheck(this, Handler);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(Handler).call(this, logger)); // RTCPeerConnection instance.
    // @type {RTCPeerConnection}

    _this._pc = new RTCPeerConnection({
      iceServers: settings.turnServers || [],
      iceTransportPolicy: settings.iceTransportPolicy,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    }); // Generic sending RTP parameters for audio and video.
    // @type {Object}

    _this._rtpParametersByKind = rtpParametersByKind; // Remote SDP handler.
    // @type {RemoteUnifiedPlanSdp}

    _this._remoteSdp = new _RemoteUnifiedPlanSdp["default"](direction, rtpParametersByKind); // Handle RTCPeerConnection connection status.

    _this._pc.addEventListener('iceconnectionstatechange', function () {
      switch (_this._pc.iceConnectionState) {
        case 'checking':
          _this.emit('@connectionstatechange', 'connecting');

          break;

        case 'connected':
        case 'completed':
          _this.emit('@connectionstatechange', 'connected');

          break;

        case 'failed':
          _this.emit('@connectionstatechange', 'failed');

          break;

        case 'disconnected':
          _this.emit('@connectionstatechange', 'disconnected');

          break;

        case 'closed':
          _this.emit('@connectionstatechange', 'closed');

          break;
      }
    });

    return _this;
  }

  _createClass(Handler, [{
    key: "close",
    value: function close() {
      logger.debug('close()'); // Close RTCPeerConnection.

      try {
        this._pc.close();
      } catch (error) {}
    }
  }, {
    key: "remoteClosed",
    value: function remoteClosed() {
      logger.debug('remoteClosed()');
      this._transportReady = false;
      if (this._transportUpdated) this._transportUpdated = false;
    }
  }]);

  return Handler;
}(_EnhancedEventEmitter2["default"]);

var SendHandler =
/*#__PURE__*/
function (_Handler) {
  _inherits(SendHandler, _Handler);

  function SendHandler(rtpParametersByKind, settings) {
    var _this2;

    _classCallCheck(this, SendHandler);

    _this2 = _possibleConstructorReturn(this, _getPrototypeOf(SendHandler).call(this, 'send', rtpParametersByKind, settings)); // Got transport local and remote parameters.
    // @type {Boolean}

    _this2._transportReady = false; // Local stream.
    // @type {MediaStream}

    _this2._stream = new MediaStream(); // RID value counter for simulcast (so they never match).
    // @type {Number}

    _this2._nextRid = 1;
    return _this2;
  }

  _createClass(SendHandler, [{
    key: "addProducer",
    value: function addProducer(producer) {
      var _this3 = this;

      var track = producer.track;
      logger.debug('addProducer() [id:%s, kind:%s, trackId:%s]', producer.id, producer.kind, track.id);
      if (this._stream.getTrackById(track.id)) return Promise.reject(new Error('track already added'));
      var rtpSender;
      var localSdpObj;
      return Promise.resolve().then(function () {
        // Add the track to the local stream.
        _this3._stream.addTrack(track); // Add the stream to the PeerConnection.


        rtpSender = _this3._pc.addTrack(track, _this3._stream);
      }).then(function () {
        var encodings = [];

        if (producer.simulcast) {
          logger.debug('addProducer() | enabling simulcast');

          if (producer.simulcast.high) {
            encodings.push({
              rid: "high".concat(_this3._nextRid),
              active: true,
              priority: 'low',
              maxBitrate: producer.simulcast.high
            });
          }

          if (producer.simulcast.medium) {
            encodings.push({
              rid: "medium".concat(_this3._nextRid),
              active: true,
              priority: 'medium',
              maxBitrate: producer.simulcast.medium
            });
          }

          if (producer.simulcast.low) {
            encodings.push({
              rid: "low".concat(_this3._nextRid),
              active: true,
              priority: 'high',
              maxBitrate: producer.simulcast.low
            });
          } // Update RID counter for future ones.


          _this3._nextRid++;
        }

        var parameters = rtpSender.getParameters();
        return rtpSender.setParameters(_objectSpread({}, parameters, {
          encodings: encodings
        }));
      }).then(function () {
        return _this3._pc.createOffer();
      }).then(function (offer) {
        logger.debug('addProducer() | calling pc.setLocalDescription() [offer:%o]', offer);
        return _this3._pc.setLocalDescription(offer);
      }).then(function () {
        if (!_this3._transportReady) return _this3._setupTransport();
      }).then(function () {
        localSdpObj = _sdpTransform["default"].parse(_this3._pc.localDescription.sdp);

        var remoteSdp = _this3._remoteSdp.createAnswerSdp(localSdpObj);

        var answer = {
          type: 'answer',
          sdp: remoteSdp
        };
        logger.debug('addProducer() | calling pc.setRemoteDescription() [answer:%o]', answer);
        return _this3._pc.setRemoteDescription(answer);
      }).then(function () {
        var rtpParameters = utils.clone(_this3._rtpParametersByKind[producer.kind]); // Fill the RTP parameters for this track.

        sdpUnifiedPlanUtils.fillRtpParametersForTrack(rtpParameters, localSdpObj, track);
        return rtpParameters;
      })["catch"](function (error) {
        // Panic here. Try to undo things.
        try {
          _this3._pc.removeTrack(rtpSender);
        } catch (error2) {}

        _this3._stream.removeTrack(track);

        throw error;
      });
    }
  }, {
    key: "removeProducer",
    value: function removeProducer(producer) {
      var _this4 = this;

      var track = producer.track;
      logger.debug('removeProducer() [id:%s, kind:%s, trackId:%s]', producer.id, producer.kind, track.id);
      return Promise.resolve().then(function () {
        // Get the associated RTCRtpSender.
        var rtpSender = _this4._pc.getSenders().find(function (s) {
          return s.track === track;
        });

        if (!rtpSender) throw new Error('RTCRtpSender not found'); // Remove the associated RtpSender.

        _this4._pc.removeTrack(rtpSender); // Remove the track from the local stream.


        _this4._stream.removeTrack(track);

        return _this4._pc.createOffer();
      }).then(function (offer) {
        logger.debug('removeProducer() | calling pc.setLocalDescription() [offer:%o]', offer);
        return _this4._pc.setLocalDescription(offer);
      }).then(function () {
        var localSdpObj = _sdpTransform["default"].parse(_this4._pc.localDescription.sdp);

        var remoteSdp = _this4._remoteSdp.createAnswerSdp(localSdpObj);

        var answer = {
          type: 'answer',
          sdp: remoteSdp
        };
        logger.debug('removeProducer() | calling pc.setRemoteDescription() [answer:%o]', answer);
        return _this4._pc.setRemoteDescription(answer);
      });
    }
  }, {
    key: "replaceProducerTrack",
    value: function replaceProducerTrack(producer, track) {
      var _this5 = this;

      logger.debug('replaceProducerTrack() [id:%s, kind:%s, trackId:%s]', producer.id, producer.kind, track.id);
      var oldTrack = producer.track;
      return Promise.resolve().then(function () {
        // Get the associated RTCRtpSender.
        var rtpSender = _this5._pc.getSenders().find(function (s) {
          return s.track === oldTrack;
        });

        if (!rtpSender) throw new Error('local track not found');
        return rtpSender.replaceTrack(track);
      }).then(function () {
        // Remove the old track from the local stream.
        _this5._stream.removeTrack(oldTrack); // Add the new track to the local stream.


        _this5._stream.addTrack(track);
      });
    }
  }, {
    key: "restartIce",
    value: function restartIce(remoteIceParameters) {
      var _this6 = this;

      logger.debug('restartIce()'); // Provide the remote SDP handler with new remote ICE parameters.

      this._remoteSdp.updateTransportRemoteIceParameters(remoteIceParameters);

      return Promise.resolve().then(function () {
        return _this6._pc.createOffer({
          iceRestart: true
        });
      }).then(function (offer) {
        logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
        return _this6._pc.setLocalDescription(offer);
      }).then(function () {
        var localSdpObj = _sdpTransform["default"].parse(_this6._pc.localDescription.sdp);

        var remoteSdp = _this6._remoteSdp.createAnswerSdp(localSdpObj);

        var answer = {
          type: 'answer',
          sdp: remoteSdp
        };
        logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
        return _this6._pc.setRemoteDescription(answer);
      });
    }
  }, {
    key: "_setupTransport",
    value: function _setupTransport() {
      var _this7 = this;

      logger.debug('_setupTransport()');
      return Promise.resolve().then(function () {
        // Get our local DTLS parameters.
        var transportLocalParameters = {};
        var sdp = _this7._pc.localDescription.sdp;

        var sdpObj = _sdpTransform["default"].parse(sdp);

        var dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj); // Let's decide that we'll be DTLS server (because we can).

        dtlsParameters.role = 'server';
        transportLocalParameters.dtlsParameters = dtlsParameters; // Provide the remote SDP handler with transport local parameters.

        _this7._remoteSdp.setTransportLocalParameters(transportLocalParameters); // We need transport remote parameters.


        return _this7.safeEmitAsPromise('@needcreatetransport', transportLocalParameters);
      }).then(function (transportRemoteParameters) {
        // Provide the remote SDP handler with transport remote parameters.
        _this7._remoteSdp.setTransportRemoteParameters(transportRemoteParameters);

        _this7._transportReady = true;
      });
    }
  }]);

  return SendHandler;
}(Handler);

var RecvHandler =
/*#__PURE__*/
function (_Handler2) {
  _inherits(RecvHandler, _Handler2);

  function RecvHandler(rtpParametersByKind, settings) {
    var _this8;

    _classCallCheck(this, RecvHandler);

    _this8 = _possibleConstructorReturn(this, _getPrototypeOf(RecvHandler).call(this, 'recv', rtpParametersByKind, settings)); // Got transport remote parameters.
    // @type {Boolean}

    _this8._transportCreated = false; // Got transport local parameters.
    // @type {Boolean}

    _this8._transportUpdated = false; // Map of Consumers information indexed by consumer.id.
    // - mid {String}
    // - kind {String}
    // - closed {Boolean}
    // - trackId {String}
    // - ssrc {Number}
    // - rtxSsrc {Number}
    // - cname {String}
    // @type {Map<Number, Object>}

    _this8._consumerInfos = new Map();
    return _this8;
  }

  _createClass(RecvHandler, [{
    key: "addConsumer",
    value: function addConsumer(consumer) {
      var _this9 = this;

      logger.debug('addConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);
      if (this._consumerInfos.has(consumer.id)) return Promise.reject(new Error('Consumer already added'));
      var encoding = consumer.rtpParameters.encodings[0];
      var cname = consumer.rtpParameters.rtcp.cname;
      var consumerInfo = {
        mid: "".concat(consumer.kind[0]).concat(consumer.id),
        kind: consumer.kind,
        closed: consumer.closed,
        streamId: "recv-stream-".concat(consumer.id),
        trackId: "consumer-".concat(consumer.kind, "-").concat(consumer.id),
        ssrc: encoding.ssrc,
        cname: cname
      };
      if (encoding.rtx && encoding.rtx.ssrc) consumerInfo.rtxSsrc = encoding.rtx.ssrc;

      this._consumerInfos.set(consumer.id, consumerInfo);

      return Promise.resolve().then(function () {
        if (!_this9._transportCreated) return _this9._setupTransport();
      }).then(function () {
        var remoteSdp = _this9._remoteSdp.createOfferSdp(Array.from(_this9._consumerInfos.values()));

        var offer = {
          type: 'offer',
          sdp: remoteSdp
        };
        logger.debug('addConsumer() | calling pc.setRemoteDescription() [offer:%o]', offer);
        return _this9._pc.setRemoteDescription(offer);
      }).then(function () {
        return _this9._pc.createAnswer();
      }).then(function (answer) {
        logger.debug('addConsumer() | calling pc.setLocalDescription() [answer:%o]', answer);
        return _this9._pc.setLocalDescription(answer);
      }).then(function () {
        if (!_this9._transportUpdated) return _this9._updateTransport();
      }).then(function () {
        var newTransceiver = _this9._pc.getTransceivers().find(function (transceiver) {
          var receiver = transceiver.receiver;
          if (!receiver) return false;
          var track = receiver.track;
          if (!track) return false;
          return transceiver.mid === consumerInfo.mid;
        });

        if (!newTransceiver) throw new Error('remote track not found');
        return newTransceiver.receiver.track;
      });
    }
  }, {
    key: "removeConsumer",
    value: function removeConsumer(consumer) {
      var _this10 = this;

      logger.debug('removeConsumer() [id:%s, kind:%s]', consumer.id, consumer.kind);

      var consumerInfo = this._consumerInfos.get(consumer.id);

      if (!consumerInfo) return Promise.reject(new Error('Consumer not found'));
      consumerInfo.closed = true;
      return Promise.resolve().then(function () {
        var remoteSdp = _this10._remoteSdp.createOfferSdp(Array.from(_this10._consumerInfos.values()));

        var offer = {
          type: 'offer',
          sdp: remoteSdp
        };
        logger.debug('removeConsumer() | calling pc.setRemoteDescription() [offer:%o]', offer);
        return _this10._pc.setRemoteDescription(offer);
      }).then(function () {
        return _this10._pc.createAnswer();
      }).then(function (answer) {
        logger.debug('removeConsumer() | calling pc.setLocalDescription() [answer:%o]', answer);
        return _this10._pc.setLocalDescription(answer);
      });
    }
  }, {
    key: "restartIce",
    value: function restartIce(remoteIceParameters) {
      var _this11 = this;

      logger.debug('restartIce()'); // Provide the remote SDP handler with new remote ICE parameters.

      this._remoteSdp.updateTransportRemoteIceParameters(remoteIceParameters);

      return Promise.resolve().then(function () {
        var remoteSdp = _this11._remoteSdp.createOfferSdp(Array.from(_this11._consumerInfos.values()));

        var offer = {
          type: 'offer',
          sdp: remoteSdp
        };
        logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
        return _this11._pc.setRemoteDescription(offer);
      }).then(function () {
        return _this11._pc.createAnswer();
      }).then(function (answer) {
        logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
        return _this11._pc.setLocalDescription(answer);
      });
    }
  }, {
    key: "_setupTransport",
    value: function _setupTransport() {
      var _this12 = this;

      logger.debug('_setupTransport()');
      return Promise.resolve().then(function () {
        // We need transport remote parameters.
        return _this12.safeEmitAsPromise('@needcreatetransport', null);
      }).then(function (transportRemoteParameters) {
        // Provide the remote SDP handler with transport remote parameters.
        _this12._remoteSdp.setTransportRemoteParameters(transportRemoteParameters);

        _this12._transportCreated = true;
      });
    }
  }, {
    key: "_updateTransport",
    value: function _updateTransport() {
      logger.debug('_updateTransport()'); // Get our local DTLS parameters.

      var sdp = this._pc.localDescription.sdp;

      var sdpObj = _sdpTransform["default"].parse(sdp);

      var dtlsParameters = sdpCommonUtils.extractDtlsParameters(sdpObj);
      var transportLocalParameters = {
        dtlsParameters: dtlsParameters
      }; // We need to provide transport local parameters.

      this.safeEmit('@needupdatetransport', transportLocalParameters);
      this._transportUpdated = true;
    }
  }]);

  return RecvHandler;
}(Handler);

var Firefox59 =
/*#__PURE__*/
function () {
  _createClass(Firefox59, null, [{
    key: "getNativeRtpCapabilities",
    value: function getNativeRtpCapabilities() {
      logger.debug('getNativeRtpCapabilities()');
      var pc = new RTCPeerConnection({
        iceServers: [],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      }); // NOTE: We need to add a real video track to get the RID extension mapping.

      var canvas = document.createElement('canvas'); // NOTE: Otherwise Firefox fails in next line.

      canvas.getContext('2d');
      var fakeStream = canvas.captureStream();
      var fakeVideoTrack = fakeStream.getVideoTracks()[0];
      var rtpSender = pc.addTrack(fakeVideoTrack, fakeStream);
      rtpSender.setParameters({
        encodings: [{
          rid: 'RID1',
          maxBitrate: 40000
        }, {
          rid: 'RID2',
          maxBitrate: 10000
        }]
      });
      return pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }).then(function (offer) {
        try {
          canvas.remove();
        } catch (error) {}

        try {
          fakeVideoTrack.stop();
        } catch (error) {}

        try {
          pc.close();
        } catch (error) {}

        var sdpObj = _sdpTransform["default"].parse(offer.sdp);

        var nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities(sdpObj);
        return nativeRtpCapabilities;
      })["catch"](function (error) {
        try {
          canvas.remove();
        } catch (error2) {}

        try {
          fakeVideoTrack.stop();
        } catch (error2) {}

        try {
          pc.close();
        } catch (error2) {}

        throw error;
      });
    }
  }, {
    key: "tag",
    get: function get() {
      return 'Firefox59';
    }
  }]);

  function Firefox59(direction, extendedRtpCapabilities, settings) {
    _classCallCheck(this, Firefox59);

    logger.debug('constructor() [direction:%s, extendedRtpCapabilities:%o]', direction, extendedRtpCapabilities);
    var rtpParametersByKind;

    switch (direction) {
      case 'send':
        {
          rtpParametersByKind = {
            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
          };
          return new SendHandler(rtpParametersByKind, settings);
        }

      case 'recv':
        {
          rtpParametersByKind = {
            audio: ortc.getReceivingFullRtpParameters('audio', extendedRtpCapabilities),
            video: ortc.getReceivingFullRtpParameters('video', extendedRtpCapabilities)
          };
          return new RecvHandler(rtpParametersByKind, settings);
        }
    }
  }

  return Firefox59;
}();

exports["default"] = Firefox59;