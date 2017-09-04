# TODO

* The abs-send-time header extension has `kind: ''` in the server capabilities (valid for any kind) which means that is always compared to true and it produces that the SDP offer of Chrome, in the m=audio, does not have it but our generated answer does it, and hence also the remote Transport.

* Must check peerconnection "closed" state or related event (it may happen without calling close on it, although I think it shouldn't...). Investigate it. Some for ORTC XxxTransports, etc.

* We are allowing calling `room.join()` after closed, but this means that events are also duplicated when re-joined! NOTE: This is a user error, but must document it.

* Properly match H264 parameters.

* Ignore FEC and RED feature codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red

* Should not ignore pseudo media codecs:
  * telephone-event
  * CN

* Implement `getStats()` in browsers? or better report uniformely from mediasoup?
