"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _sdpTransform = _interopRequireDefault(require("sdp-transform"));

var _Logger = _interopRequireDefault(require("../../Logger"));

var utils = _interopRequireWildcard(require("../../utils"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function _getRequireWildcardCache() { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var logger = new _Logger["default"]('RemoteUnifiedPlanSdp');

var RemoteSdp =
/*#__PURE__*/
function () {
  function RemoteSdp(rtpParametersByKind) {
    _classCallCheck(this, RemoteSdp);

    // Generic sending RTP parameters for audio and video.
    // @type {Object}
    this._rtpParametersByKind = rtpParametersByKind; // Transport local parameters, including DTLS parameteres.
    // @type {Object}

    this._transportLocalParameters = null; // Transport remote parameters, including ICE parameters, ICE candidates
    // and DTLS parameteres.
    // @type {Object}

    this._transportRemoteParameters = null; // SDP global fields.
    // @type {Object}

    this._sdpGlobalFields = {
      id: utils.randomNumber(),
      version: 0
    };
  }

  _createClass(RemoteSdp, [{
    key: "setTransportLocalParameters",
    value: function setTransportLocalParameters(transportLocalParameters) {
      logger.debug('setTransportLocalParameters() [transportLocalParameters:%o]', transportLocalParameters);
      this._transportLocalParameters = transportLocalParameters;
    }
  }, {
    key: "setTransportRemoteParameters",
    value: function setTransportRemoteParameters(transportRemoteParameters) {
      logger.debug('setTransportRemoteParameters() [transportRemoteParameters:%o]', transportRemoteParameters);
      this._transportRemoteParameters = transportRemoteParameters;
    }
  }, {
    key: "updateTransportRemoteIceParameters",
    value: function updateTransportRemoteIceParameters(remoteIceParameters) {
      logger.debug('updateTransportRemoteIceParameters() [remoteIceParameters:%o]', remoteIceParameters);
      this._transportRemoteParameters.iceParameters = remoteIceParameters;
    }
  }]);

  return RemoteSdp;
}();

var SendRemoteSdp =
/*#__PURE__*/
function (_RemoteSdp) {
  _inherits(SendRemoteSdp, _RemoteSdp);

  function SendRemoteSdp(rtpParametersByKind) {
    _classCallCheck(this, SendRemoteSdp);

    return _possibleConstructorReturn(this, _getPrototypeOf(SendRemoteSdp).call(this, rtpParametersByKind));
  }

  _createClass(SendRemoteSdp, [{
    key: "createAnswerSdp",
    value: function createAnswerSdp(localSdpObj) {
      logger.debug('createAnswerSdp()');
      if (!this._transportLocalParameters) throw new Error('no transport local parameters');else if (!this._transportRemoteParameters) throw new Error('no transport remote parameters');
      var remoteIceParameters = this._transportRemoteParameters.iceParameters;
      var remoteIceCandidates = this._transportRemoteParameters.iceCandidates;
      var remoteDtlsParameters = this._transportRemoteParameters.dtlsParameters;
      var sdpObj = {};
      var bundleMids = (localSdpObj.media || []).filter(function (m) {
        return m.hasOwnProperty('mid');
      }).map(function (m) {
        return String(m.mid);
      }); // Increase our SDP version.

      this._sdpGlobalFields.version++;
      sdpObj.version = 0;
      sdpObj.origin = {
        address: '0.0.0.0',
        ipVer: 4,
        netType: 'IN',
        sessionId: this._sdpGlobalFields.id,
        sessionVersion: this._sdpGlobalFields.version,
        username: 'mediasoup-client'
      };
      sdpObj.name = '-';
      sdpObj.timing = {
        start: 0,
        stop: 0
      };
      sdpObj.icelite = remoteIceParameters.iceLite ? 'ice-lite' : null;
      sdpObj.msidSemantic = {
        semantic: 'WMS',
        token: '*'
      };

      if (bundleMids.length > 0) {
        sdpObj.groups = [{
          type: 'BUNDLE',
          mids: bundleMids.join(' ')
        }];
      }

      sdpObj.media = []; // NOTE: We take the latest fingerprint.

      var numFingerprints = remoteDtlsParameters.fingerprints.length;
      sdpObj.fingerprint = {
        type: remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
        hash: remoteDtlsParameters.fingerprints[numFingerprints - 1].value
      };
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = (localSdpObj.media || [])[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var localMediaObj = _step.value;
          var closed = localMediaObj.direction === 'inactive';
          var kind = localMediaObj.type;
          var codecs = this._rtpParametersByKind[kind].codecs;
          var headerExtensions = this._rtpParametersByKind[kind].headerExtensions;
          var remoteMediaObj = {};
          remoteMediaObj.type = localMediaObj.type;
          remoteMediaObj.port = 7;
          remoteMediaObj.protocol = 'RTP/SAVPF';
          remoteMediaObj.connection = {
            ip: '127.0.0.1',
            version: 4
          };
          remoteMediaObj.mid = localMediaObj.mid;
          remoteMediaObj.iceUfrag = remoteIceParameters.usernameFragment;
          remoteMediaObj.icePwd = remoteIceParameters.password;
          remoteMediaObj.candidates = [];
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = remoteIceCandidates[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var candidate = _step2.value;
              var candidateObj = {}; // mediasoup does not support non rtcp-mux so candidates component is
              // always RTP (1).

              candidateObj.component = 1;
              candidateObj.foundation = candidate.foundation;
              candidateObj.ip = candidate.ip;
              candidateObj.port = candidate.port;
              candidateObj.priority = candidate.priority;
              candidateObj.transport = candidate.protocol;
              candidateObj.type = candidate.type;
              if (candidate.tcpType) candidateObj.tcptype = candidate.tcpType;
              remoteMediaObj.candidates.push(candidateObj);
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

          remoteMediaObj.endOfCandidates = 'end-of-candidates'; // Announce support for ICE renomination.
          // https://tools.ietf.org/html/draft-thatcher-ice-renomination

          remoteMediaObj.iceOptions = 'renomination';

          switch (remoteDtlsParameters.role) {
            case 'client':
              remoteMediaObj.setup = 'active';
              break;

            case 'server':
              remoteMediaObj.setup = 'passive';
              break;
          }

          switch (localMediaObj.direction) {
            case 'sendrecv':
            case 'sendonly':
              remoteMediaObj.direction = 'recvonly';
              break;

            case 'recvonly':
            case 'inactive':
              remoteMediaObj.direction = 'inactive';
              break;
          }

          remoteMediaObj.rtp = [];
          remoteMediaObj.rtcpFb = [];
          remoteMediaObj.fmtp = [];
          var _iteratorNormalCompletion3 = true;
          var _didIteratorError3 = false;
          var _iteratorError3 = undefined;

          try {
            for (var _iterator3 = codecs[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
              var codec = _step3.value;
              var rtp = {
                payload: codec.payloadType,
                codec: codec.name,
                rate: codec.clockRate
              };
              if (codec.channels > 1) rtp.encoding = codec.channels;
              remoteMediaObj.rtp.push(rtp);

              if (codec.parameters) {
                var paramFmtp = {
                  payload: codec.payloadType,
                  config: ''
                };

                for (var _i = 0, _Object$keys = Object.keys(codec.parameters); _i < _Object$keys.length; _i++) {
                  var key = _Object$keys[_i];
                  if (paramFmtp.config) paramFmtp.config += ';';
                  paramFmtp.config += "".concat(key, "=").concat(codec.parameters[key]);
                }

                if (paramFmtp.config) remoteMediaObj.fmtp.push(paramFmtp);
              }

              if (codec.rtcpFeedback) {
                var _iteratorNormalCompletion7 = true;
                var _didIteratorError7 = false;
                var _iteratorError7 = undefined;

                try {
                  for (var _iterator7 = codec.rtcpFeedback[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                    var fb = _step7.value;
                    remoteMediaObj.rtcpFb.push({
                      payload: codec.payloadType,
                      type: fb.type,
                      subtype: fb.parameter || ''
                    });
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

          remoteMediaObj.payloads = codecs.map(function (codec) {
            return codec.payloadType;
          }).join(' '); // NOTE: Firefox does not like a=extmap lines if a=inactive.

          if (!closed) {
            remoteMediaObj.ext = [];
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
              var _loop = function _loop() {
                var ext = _step4.value;
                // Don't add a header extension if not present in the offer.
                var matchedLocalExt = (localMediaObj.ext || []).find(function (localExt) {
                  return localExt.uri === ext.uri;
                });
                if (!matchedLocalExt) return "continue";
                remoteMediaObj.ext.push({
                  uri: ext.uri,
                  value: ext.id
                });
              };

              for (var _iterator4 = headerExtensions[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var _ret = _loop();

                if (_ret === "continue") continue;
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
          } // Simulcast.


          if (localMediaObj.simulcast) {
            remoteMediaObj.simulcast = {
              dir1: 'recv',
              list1: localMediaObj.simulcast.list1
            };
            remoteMediaObj.rids = [];
            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
              for (var _iterator5 = (localMediaObj.rids || [])[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                var rid = _step5.value;
                if (rid.direction !== 'send') continue;
                remoteMediaObj.rids.push({
                  id: rid.id,
                  direction: 'recv'
                });
              }
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
          } // Simulcast (draft version 03).
          else if (localMediaObj.simulcast_03) {
              // eslint-disable-next-line camelcase
              remoteMediaObj.simulcast_03 = {
                value: localMediaObj.simulcast_03.value.replace(/send/g, 'recv')
              };
              remoteMediaObj.rids = [];
              var _iteratorNormalCompletion6 = true;
              var _didIteratorError6 = false;
              var _iteratorError6 = undefined;

              try {
                for (var _iterator6 = (localMediaObj.rids || [])[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                  var _rid = _step6.value;
                  if (_rid.direction !== 'send') continue;
                  remoteMediaObj.rids.push({
                    id: _rid.id,
                    direction: 'recv'
                  });
                }
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
            }

          remoteMediaObj.rtcpMux = 'rtcp-mux';
          remoteMediaObj.rtcpRsize = 'rtcp-rsize'; // Push it.

          sdpObj.media.push(remoteMediaObj);
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

      var sdp = _sdpTransform["default"].write(sdpObj);

      return sdp;
    }
  }]);

  return SendRemoteSdp;
}(RemoteSdp);

var RecvRemoteSdp =
/*#__PURE__*/
function (_RemoteSdp2) {
  _inherits(RecvRemoteSdp, _RemoteSdp2);

  function RecvRemoteSdp(rtpParametersByKind) {
    _classCallCheck(this, RecvRemoteSdp);

    return _possibleConstructorReturn(this, _getPrototypeOf(RecvRemoteSdp).call(this, rtpParametersByKind));
  }
  /**
   * @param {Array<Object>} consumerInfos - Consumer informations.
   * @return {String}
   */


  _createClass(RecvRemoteSdp, [{
    key: "createOfferSdp",
    value: function createOfferSdp(consumerInfos) {
      logger.debug('createOfferSdp()');
      if (!this._transportRemoteParameters) throw new Error('no transport remote parameters');
      var remoteIceParameters = this._transportRemoteParameters.iceParameters;
      var remoteIceCandidates = this._transportRemoteParameters.iceCandidates;
      var remoteDtlsParameters = this._transportRemoteParameters.dtlsParameters;
      var sdpObj = {};
      var mids = consumerInfos.map(function (info) {
        return String(info.mid);
      }); // Increase our SDP version.

      this._sdpGlobalFields.version++;
      sdpObj.version = 0;
      sdpObj.origin = {
        address: '0.0.0.0',
        ipVer: 4,
        netType: 'IN',
        sessionId: this._sdpGlobalFields.id,
        sessionVersion: this._sdpGlobalFields.version,
        username: 'mediasoup-client'
      };
      sdpObj.name = '-';
      sdpObj.timing = {
        start: 0,
        stop: 0
      };
      sdpObj.icelite = remoteIceParameters.iceLite ? 'ice-lite' : null;
      sdpObj.msidSemantic = {
        semantic: 'WMS',
        token: '*'
      };

      if (mids.length > 0) {
        sdpObj.groups = [{
          type: 'BUNDLE',
          mids: mids.join(' ')
        }];
      }

      sdpObj.media = []; // NOTE: We take the latest fingerprint.

      var numFingerprints = remoteDtlsParameters.fingerprints.length;
      sdpObj.fingerprint = {
        type: remoteDtlsParameters.fingerprints[numFingerprints - 1].algorithm,
        hash: remoteDtlsParameters.fingerprints[numFingerprints - 1].value
      };
      var _iteratorNormalCompletion8 = true;
      var _didIteratorError8 = false;
      var _iteratorError8 = undefined;

      try {
        for (var _iterator8 = consumerInfos[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
          var info = _step8.value;
          var closed = info.closed;
          var kind = info.kind;
          var codecs = void 0;
          var headerExtensions = void 0;

          if (info.kind !== 'application') {
            codecs = this._rtpParametersByKind[kind].codecs;
            headerExtensions = this._rtpParametersByKind[kind].headerExtensions;
          }

          var remoteMediaObj = {};

          if (info.kind !== 'application') {
            remoteMediaObj.type = kind;
            remoteMediaObj.port = 7;
            remoteMediaObj.protocol = 'RTP/SAVPF';
            remoteMediaObj.connection = {
              ip: '127.0.0.1',
              version: 4
            };
            remoteMediaObj.mid = info.mid;
            remoteMediaObj.msid = "".concat(info.streamId, " ").concat(info.trackId);
          } else {
            remoteMediaObj.type = kind;
            remoteMediaObj.port = 9;
            remoteMediaObj.protocol = 'DTLS/SCTP';
            remoteMediaObj.connection = {
              ip: '127.0.0.1',
              version: 4
            };
            remoteMediaObj.mid = info.mid;
          }

          remoteMediaObj.iceUfrag = remoteIceParameters.usernameFragment;
          remoteMediaObj.icePwd = remoteIceParameters.password;
          remoteMediaObj.candidates = [];
          var _iteratorNormalCompletion9 = true;
          var _didIteratorError9 = false;
          var _iteratorError9 = undefined;

          try {
            for (var _iterator9 = remoteIceCandidates[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
              var candidate = _step9.value;
              var candidateObj = {}; // mediasoup does not support non rtcp-mux so candidates component is
              // always RTP (1).

              candidateObj.component = 1;
              candidateObj.foundation = candidate.foundation;
              candidateObj.ip = candidate.ip;
              candidateObj.port = candidate.port;
              candidateObj.priority = candidate.priority;
              candidateObj.transport = candidate.protocol;
              candidateObj.type = candidate.type;
              if (candidate.tcpType) candidateObj.tcptype = candidate.tcpType;
              remoteMediaObj.candidates.push(candidateObj);
            }
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

          remoteMediaObj.endOfCandidates = 'end-of-candidates'; // Announce support for ICE renomination.
          // https://tools.ietf.org/html/draft-thatcher-ice-renomination

          remoteMediaObj.iceOptions = 'renomination';
          remoteMediaObj.setup = 'actpass';

          if (info.kind !== 'application') {
            if (!closed) remoteMediaObj.direction = 'sendonly';else remoteMediaObj.direction = 'inactive';
            remoteMediaObj.rtp = [];
            remoteMediaObj.rtcpFb = [];
            remoteMediaObj.fmtp = [];
            var _iteratorNormalCompletion10 = true;
            var _didIteratorError10 = false;
            var _iteratorError10 = undefined;

            try {
              for (var _iterator10 = codecs[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                var codec = _step10.value;
                var rtp = {
                  payload: codec.payloadType,
                  codec: codec.name,
                  rate: codec.clockRate
                };
                if (codec.channels > 1) rtp.encoding = codec.channels;
                remoteMediaObj.rtp.push(rtp);

                if (codec.parameters) {
                  var paramFmtp = {
                    payload: codec.payloadType,
                    config: ''
                  };

                  for (var _i2 = 0, _Object$keys2 = Object.keys(codec.parameters); _i2 < _Object$keys2.length; _i2++) {
                    var key = _Object$keys2[_i2];
                    if (paramFmtp.config) paramFmtp.config += ';';
                    paramFmtp.config += "".concat(key, "=").concat(codec.parameters[key]);
                  }

                  if (paramFmtp.config) remoteMediaObj.fmtp.push(paramFmtp);
                }

                if (codec.rtcpFeedback) {
                  var _iteratorNormalCompletion12 = true;
                  var _didIteratorError12 = false;
                  var _iteratorError12 = undefined;

                  try {
                    for (var _iterator12 = codec.rtcpFeedback[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                      var fb = _step12.value;
                      remoteMediaObj.rtcpFb.push({
                        payload: codec.payloadType,
                        type: fb.type,
                        subtype: fb.parameter || ''
                      });
                    }
                  } catch (err) {
                    _didIteratorError12 = true;
                    _iteratorError12 = err;
                  } finally {
                    try {
                      if (!_iteratorNormalCompletion12 && _iterator12["return"] != null) {
                        _iterator12["return"]();
                      }
                    } finally {
                      if (_didIteratorError12) {
                        throw _iteratorError12;
                      }
                    }
                  }
                }
              }
            } catch (err) {
              _didIteratorError10 = true;
              _iteratorError10 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion10 && _iterator10["return"] != null) {
                  _iterator10["return"]();
                }
              } finally {
                if (_didIteratorError10) {
                  throw _iteratorError10;
                }
              }
            }

            remoteMediaObj.payloads = codecs.map(function (codec) {
              return codec.payloadType;
            }).join(' '); // NOTE: Firefox does not like a=extmap lines if a=inactive.

            if (!closed) {
              remoteMediaObj.ext = [];
              var _iteratorNormalCompletion11 = true;
              var _didIteratorError11 = false;
              var _iteratorError11 = undefined;

              try {
                for (var _iterator11 = headerExtensions[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                  var ext = _step11.value;
                  // Ignore MID RTP extension for receiving media.
                  if (ext.uri === 'urn:ietf:params:rtp-hdrext:sdes:mid') continue;
                  remoteMediaObj.ext.push({
                    uri: ext.uri,
                    value: ext.id
                  });
                }
              } catch (err) {
                _didIteratorError11 = true;
                _iteratorError11 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion11 && _iterator11["return"] != null) {
                    _iterator11["return"]();
                  }
                } finally {
                  if (_didIteratorError11) {
                    throw _iteratorError11;
                  }
                }
              }
            }

            remoteMediaObj.rtcpMux = 'rtcp-mux';
            remoteMediaObj.rtcpRsize = 'rtcp-rsize';

            if (!closed) {
              remoteMediaObj.ssrcs = [];
              remoteMediaObj.ssrcGroups = [];
              remoteMediaObj.ssrcs.push({
                id: info.ssrc,
                attribute: 'cname',
                value: info.cname
              });

              if (info.rtxSsrc) {
                remoteMediaObj.ssrcs.push({
                  id: info.rtxSsrc,
                  attribute: 'cname',
                  value: info.cname
                }); // Associate original and retransmission SSRC.

                remoteMediaObj.ssrcGroups.push({
                  semantics: 'FID',
                  ssrcs: "".concat(info.ssrc, " ").concat(info.rtxSsrc)
                });
              }
            }
          } else {
            remoteMediaObj.payloads = 5000;
            remoteMediaObj.sctpmap = {
              app: 'webrtc-datachannel',
              maxMessageSize: 256,
              sctpmapNumber: 5000
            };
          } // Push it.


          sdpObj.media.push(remoteMediaObj);
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

      var sdp = _sdpTransform["default"].write(sdpObj);

      return sdp;
    }
  }]);

  return RecvRemoteSdp;
}(RemoteSdp);

var RemoteUnifiedPlanSdp = function RemoteUnifiedPlanSdp(direction, rtpParametersByKind) {
  _classCallCheck(this, RemoteUnifiedPlanSdp);

  logger.debug('constructor() [direction:%s, rtpParametersByKind:%o]', direction, rtpParametersByKind);

  switch (direction) {
    case 'send':
      return new SendRemoteSdp(rtpParametersByKind);

    case 'recv':
      return new RecvRemoteSdp(rtpParametersByKind);
  }
};

exports["default"] = RemoteUnifiedPlanSdp;