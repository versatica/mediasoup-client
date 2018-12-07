## v3 TODO

* Update `bowser` to v2 (ask the author first since it's beta yet).

* Refactor `handler.remoteClosed()` (which just must happen when the ICE or DTLS is closed via DTLS alert).
  - TODO: mediasoup server should not close a `Transport` instance (nor its C++ `WebRtcTransport` instance) when its `DtlsTransport` is closed/failed. Instead it should reset its `DtlsTransport` instance.  

* Expose `RTCRtpSender/Receiver` objects into `Producer` and `Consumer`? I don't like it because the app could change simulcast settings, etc, without lib knowledge. May be just expose an API to get native local stats (also in `Transport` which would mean the `pc`).

* Test changes to simulcast in Chrome/Safari by passing an object with just `low` and `medium`.

* API to select which codec to use when sending? 
