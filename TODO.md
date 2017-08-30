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

* In Firefox, if the PC has no active send/recv tracks, its transport is closed via DTLS CLOSE ALERT (https://bugzilla.mozilla.org/show_bug.cgi?id=1355486), so we can avoid SDP O/A if there are 0 active tracks, (and leave only one) or we can react on DTLS CLOSE ALERT in the server, notify it to the client, and reset the handler.
  - Or we can have a fake DataChannel, but Firefox does also close the DTLS if there is no audio/video tracks.
  - This is for both sending and receiving PeerConnections.
Currently, in Firefox50.removeProducer/Consumer, we don't do SDP O/A if this is the latest Producer/Consumer. However, it does not work. When clater adding a new Producer Firefox sends nothing. I think that it's changing the transport ICE and DTLS stuff...
Hummm, no no, it was a problem with H264 (not yet properly negotiated). When using opus and VP8, if I close the audio Producer, Firefox stops sending VP8. Fucking SDP and BUNDLE.
https://github.com/versatica/mediasoup-client/issues/2

* Implement `getStats()` in browsers? or better report uniformely from mediasoup?
