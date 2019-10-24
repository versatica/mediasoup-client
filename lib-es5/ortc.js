"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getExtendedRtpCapabilities = getExtendedRtpCapabilities;
exports.getRtpCapabilities = getRtpCapabilities;
exports.getUnsupportedCodecs = getUnsupportedCodecs;
exports.canSend = canSend;
exports.canReceive = canReceive;
exports.getSendingRtpParameters = getSendingRtpParameters;
exports.getReceivingFullRtpParameters = getReceivingFullRtpParameters;

/**
 * Generate extended RTP capabilities for sending and receiving.
 *
 * @param {RTCRtpCapabilities} localCaps - Local capabilities.
 * @param {RTCRtpCapabilities} remoteCaps - Remote capabilities.
 *
 * @return {RTCExtendedRtpCapabilities}
 */
function getExtendedRtpCapabilities(localCaps, remoteCaps) {
  var extendedCaps = {
    codecs: [],
    headerExtensions: [],
    fecMechanisms: []
  }; // Match media codecs and keep the order preferred by remoteCaps.

  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    var _loop = function _loop() {
      var remoteCodec = _step.value;
      // TODO: Ignore pseudo-codecs and feature codecs.
      if (remoteCodec.name === 'rtx') return "continue";
      var matchingLocalCodec = (localCaps.codecs || []).find(function (localCodec) {
        return matchCapCodecs(localCodec, remoteCodec);
      });

      if (matchingLocalCodec) {
        var extendedCodec = {
          name: remoteCodec.name,
          mimeType: remoteCodec.mimeType,
          kind: remoteCodec.kind,
          clockRate: remoteCodec.clockRate,
          sendPayloadType: matchingLocalCodec.preferredPayloadType,
          sendRtxPayloadType: null,
          recvPayloadType: remoteCodec.preferredPayloadType,
          recvRtxPayloadType: null,
          channels: remoteCodec.channels,
          rtcpFeedback: reduceRtcpFeedback(matchingLocalCodec, remoteCodec),
          parameters: remoteCodec.parameters
        };
        if (!extendedCodec.channels) delete extendedCodec.channels;
        extendedCaps.codecs.push(extendedCodec);
      }
    };

    for (var _iterator = (remoteCaps.codecs || [])[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _ret = _loop();

      if (_ret === "continue") continue;
    } // Match RTX codecs.

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
    var _loop2 = function _loop2() {
      var extendedCodec = _step2.value;
      var matchingLocalRtxCodec = (localCaps.codecs || []).find(function (localCodec) {
        return localCodec.name === 'rtx' && localCodec.parameters.apt === extendedCodec.sendPayloadType;
      });
      var matchingRemoteRtxCodec = (remoteCaps.codecs || []).find(function (remoteCodec) {
        return remoteCodec.name === 'rtx' && remoteCodec.parameters.apt === extendedCodec.recvPayloadType;
      });

      if (matchingLocalRtxCodec && matchingRemoteRtxCodec) {
        extendedCodec.sendRtxPayloadType = matchingLocalRtxCodec.preferredPayloadType;
        extendedCodec.recvRtxPayloadType = matchingRemoteRtxCodec.preferredPayloadType;
      }
    };

    for (var _iterator2 = (extendedCaps.codecs || [])[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      _loop2();
    } // Match header extensions.

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
    var _loop3 = function _loop3() {
      var remoteExt = _step3.value;
      var matchingLocalExt = (localCaps.headerExtensions || []).find(function (localExt) {
        return matchCapHeaderExtensions(localExt, remoteExt);
      });

      if (matchingLocalExt) {
        var extendedExt = {
          kind: remoteExt.kind,
          uri: remoteExt.uri,
          sendId: matchingLocalExt.preferredId,
          recvId: remoteExt.preferredId
        };
        extendedCaps.headerExtensions.push(extendedExt);
      }
    };

    for (var _iterator3 = (remoteCaps.headerExtensions || [])[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      _loop3();
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

  return extendedCaps;
}
/**
 * Generate RTP capabilities for receiving media based on the given extended
 * RTP capabilities.
 *
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @return {RTCRtpCapabilities}
 */


function getRtpCapabilities(extendedRtpCapabilities) {
  var caps = {
    codecs: [],
    headerExtensions: [],
    fecMechanisms: []
  };
  var _iteratorNormalCompletion4 = true;
  var _didIteratorError4 = false;
  var _iteratorError4 = undefined;

  try {
    for (var _iterator4 = extendedRtpCapabilities.codecs[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
      var capCodec = _step4.value;
      var codec = {
        name: capCodec.name,
        mimeType: capCodec.mimeType,
        kind: capCodec.kind,
        clockRate: capCodec.clockRate,
        preferredPayloadType: capCodec.recvPayloadType,
        channels: capCodec.channels,
        rtcpFeedback: capCodec.rtcpFeedback,
        parameters: capCodec.parameters
      };
      if (!codec.channels) delete codec.channels;
      caps.codecs.push(codec); // Add RTX codec.

      if (capCodec.recvRtxPayloadType) {
        var rtxCapCodec = {
          name: 'rtx',
          mimeType: "".concat(capCodec.kind, "/rtx"),
          kind: capCodec.kind,
          clockRate: capCodec.clockRate,
          preferredPayloadType: capCodec.recvRtxPayloadType,
          parameters: {
            apt: capCodec.recvPayloadType
          }
        };
        caps.codecs.push(rtxCapCodec);
      } // TODO: In the future, we need to add FEC, CN, etc, codecs.

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

  var _iteratorNormalCompletion5 = true;
  var _didIteratorError5 = false;
  var _iteratorError5 = undefined;

  try {
    for (var _iterator5 = extendedRtpCapabilities.headerExtensions[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
      var capExt = _step5.value;
      var ext = {
        kind: capExt.kind,
        uri: capExt.uri,
        preferredId: capExt.recvId
      };
      caps.headerExtensions.push(ext);
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

  caps.fecMechanisms = extendedRtpCapabilities.fecMechanisms;
  return caps;
}
/**
 * Get unsupported remote codecs.
 *
 * @param {RTCRtpCapabilities} remoteCaps - Remote capabilities.
 * @param {Array<Number>} mandatoryCodecPayloadTypes - List of codec PT values.
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @return {Boolean}
 */


function getUnsupportedCodecs(remoteCaps, mandatoryCodecPayloadTypes, extendedRtpCapabilities) {
  // If not given just ignore.
  if (!Array.isArray(mandatoryCodecPayloadTypes)) return [];
  var unsupportedCodecs = [];
  var remoteCodecs = remoteCaps.codecs;
  var supportedCodecs = extendedRtpCapabilities.codecs;
  var _iteratorNormalCompletion6 = true;
  var _didIteratorError6 = false;
  var _iteratorError6 = undefined;

  try {
    var _loop4 = function _loop4() {
      var pt = _step6.value;

      if (!supportedCodecs.some(function (codec) {
        return codec.recvPayloadType === pt;
      })) {
        var unsupportedCodec = remoteCodecs.find(function (codec) {
          return codec.preferredPayloadType === pt;
        });
        if (!unsupportedCodec) throw new Error("mandatory codec PT ".concat(pt, " not found in remote codecs"));
        unsupportedCodecs.push(unsupportedCodec);
      }
    };

    for (var _iterator6 = mandatoryCodecPayloadTypes[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
      _loop4();
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

  return unsupportedCodecs;
}
/**
 * Whether media can be sent based on the given RTP capabilities.
 *
 * @param {String} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @return {Boolean}
 */


function canSend(kind, extendedRtpCapabilities) {
  return extendedRtpCapabilities.codecs.some(function (codec) {
    return codec.kind === kind;
  });
}
/**
 * Whether the given RTP parameters can be received with the given RTP
 * capabilities.
 *
 * @param {RTCRtpParameters} rtpParameters
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @return {Boolean}
 */


function canReceive(rtpParameters, extendedRtpCapabilities) {
  if (rtpParameters.codecs.length === 0) return false;
  var firstMediaCodec = rtpParameters.codecs[0];
  return extendedRtpCapabilities.codecs.some(function (codec) {
    return codec.recvPayloadType === firstMediaCodec.payloadType;
  });
}
/**
 * Generate RTP parameters of the given kind for sending media.
 * Just the first media codec per kind is considered.
 * NOTE: muxId, encodings and rtcp fields are left empty.
 *
 * @param {kind} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @return {RTCRtpParameters}
 */


function getSendingRtpParameters(kind, extendedRtpCapabilities) {
  var params = {
    muxId: null,
    codecs: [],
    headerExtensions: [],
    encodings: [],
    rtcp: {}
  };
  var _iteratorNormalCompletion7 = true;
  var _didIteratorError7 = false;
  var _iteratorError7 = undefined;

  try {
    for (var _iterator7 = extendedRtpCapabilities.codecs[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
      var capCodec = _step7.value;
      if (capCodec.kind !== kind) continue;
      var codec = {
        name: capCodec.name,
        mimeType: capCodec.mimeType,
        clockRate: capCodec.clockRate,
        payloadType: capCodec.sendPayloadType,
        channels: capCodec.channels,
        rtcpFeedback: capCodec.rtcpFeedback,
        parameters: capCodec.parameters
      };
      if (!codec.channels) delete codec.channels;
      params.codecs.push(codec); // Add RTX codec.

      if (capCodec.sendRtxPayloadType) {
        var rtxCodec = {
          name: 'rtx',
          mimeType: "".concat(capCodec.kind, "/rtx"),
          clockRate: capCodec.clockRate,
          payloadType: capCodec.sendRtxPayloadType,
          parameters: {
            apt: capCodec.sendPayloadType
          }
        };
        params.codecs.push(rtxCodec);
      } // NOTE: We assume a single media codec plus an optional RTX codec for now.
      // TODO: In the future, we need to add FEC, CN, etc, codecs.


      break;
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

  var _iteratorNormalCompletion8 = true;
  var _didIteratorError8 = false;
  var _iteratorError8 = undefined;

  try {
    for (var _iterator8 = extendedRtpCapabilities.headerExtensions[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
      var capExt = _step8.value;
      if (capExt.kind && capExt.kind !== kind) continue;
      var ext = {
        uri: capExt.uri,
        id: capExt.sendId
      };
      params.headerExtensions.push(ext);
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

  return params;
}
/**
 * Generate RTP parameters of the given kind for receiving media.
 * All the media codecs per kind are considered. This is useful for generating
 * a SDP remote offer.
 * NOTE: muxId, encodings and rtcp fields are left empty.
 *
 * @param {String} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @return {RTCRtpParameters}
 */


function getReceivingFullRtpParameters(kind, extendedRtpCapabilities) {
  var params = {
    muxId: null,
    codecs: [],
    headerExtensions: [],
    encodings: [],
    rtcp: {}
  };
  var _iteratorNormalCompletion9 = true;
  var _didIteratorError9 = false;
  var _iteratorError9 = undefined;

  try {
    for (var _iterator9 = extendedRtpCapabilities.codecs[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
      var capCodec = _step9.value;
      if (capCodec.kind !== kind) continue;
      var codec = {
        name: capCodec.name,
        mimeType: capCodec.mimeType,
        clockRate: capCodec.clockRate,
        payloadType: capCodec.recvPayloadType,
        channels: capCodec.channels,
        rtcpFeedback: capCodec.rtcpFeedback,
        parameters: capCodec.parameters
      };
      if (!codec.channels) delete codec.channels;
      params.codecs.push(codec); // Add RTX codec.

      if (capCodec.recvRtxPayloadType) {
        var rtxCodec = {
          name: 'rtx',
          mimeType: "".concat(capCodec.kind, "/rtx"),
          clockRate: capCodec.clockRate,
          payloadType: capCodec.recvRtxPayloadType,
          parameters: {
            apt: capCodec.recvPayloadType
          }
        };
        params.codecs.push(rtxCodec);
      } // TODO: In the future, we need to add FEC, CN, etc, codecs.

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

  var _iteratorNormalCompletion10 = true;
  var _didIteratorError10 = false;
  var _iteratorError10 = undefined;

  try {
    for (var _iterator10 = extendedRtpCapabilities.headerExtensions[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
      var capExt = _step10.value;
      if (capExt.kind && capExt.kind !== kind) continue;
      var ext = {
        uri: capExt.uri,
        id: capExt.recvId
      };
      params.headerExtensions.push(ext);
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

  return params;
}

function matchCapCodecs(aCodec, bCodec) {
  var aMimeType = aCodec.mimeType.toLowerCase();
  var bMimeType = bCodec.mimeType.toLowerCase();
  if (aMimeType !== bMimeType) return false;
  if (aCodec.clockRate !== bCodec.clockRate) return false;
  if (aCodec.channels !== bCodec.channels) return false; // Match H264 parameters.

  if (aMimeType === 'video/h264') {
    var aPacketizationMode = (aCodec.parameters || {})['packetization-mode'] || 0;
    var bPacketizationMode = (bCodec.parameters || {})['packetization-mode'] || 0;
    if (aPacketizationMode !== bPacketizationMode) return false;
  }

  return true;
}

function matchCapHeaderExtensions(aExt, bExt) {
  if (aExt.kind && bExt.kind && aExt.kind !== bExt.kind) return false;
  if (aExt.uri !== bExt.uri) return false;
  return true;
}

function reduceRtcpFeedback(codecA, codecB) {
  var reducedRtcpFeedback = [];
  var _iteratorNormalCompletion11 = true;
  var _didIteratorError11 = false;
  var _iteratorError11 = undefined;

  try {
    var _loop5 = function _loop5() {
      var aFb = _step11.value;
      var matchingBFb = (codecB.rtcpFeedback || []).find(function (bFb) {
        return bFb.type === aFb.type && bFb.parameter === aFb.parameter;
      });
      if (matchingBFb) reducedRtcpFeedback.push(matchingBFb);
    };

    for (var _iterator11 = (codecA.rtcpFeedback || [])[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
      _loop5();
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

  return reducedRtcpFeedback;
}