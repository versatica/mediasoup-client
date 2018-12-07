## v3 TODO

* Update `bowser` to v2 (ask the author first since it's beta yet).

* Refactor `handler.remoteClosed()` (which just must happen when the ICE or DTLS is closed via DTLS alert).
  - TODO: mediasoup server should not close a `Transport` instance (nor its C++ `WebRtcTransport` instance) when its `DtlsTransport` is closed/failed. Instead it should reset its `DtlsTransport` instance.  

* Expose `RTCRtpSender/Receiver` objects into `Producer` and `Consumer`? I don't like it because the app could change simulcast settings, etc, without lib knowledge. May be just expose an API to get native local stats (also in `Transport` which would mean the `pc`).

* Test changes to simulcast in Chrome/Safari by passing an object with just `low` and `medium`.

* API to select which codec to use when sending? For this, `ortc.getSendingRtpParameters()` should become `getSendingFullRtpParameters()` and include all the supported codecs (that matches the ones in the room, of course). And then, `handler.send()` should be told somehow about which one to use. This also means that remote SDP classes should keep info about senders to know which codecs to use for each m=section when building a SDP answer.
  - NOTE: Throw in PlanB browsers (or just for the second one or so on).
  - Or easier: do nothing. Instead, the client app could generate a second `device` and provide it with a subset of the `roomRtpCapabilities`.
