## v3 TODO

* Update `bowser` to v2 (ask the author first since it's beta yet).

* Refactor `handler.remoteClosed()` (which just must happen when the ICE or DTLS is closed via DTLS alert).
  - TODO: mediasoup server should not close a `Transport` instance (nor its C++ `WebRtcTransport` instance) when its `DtlsTransport` is closed/failed. Instead it should reset its `DtlsTransport` instance.  

* Remove `direction` stuff from server-side Transport.

* Remove "@needupdateproducer" also in server (it's just for old Chrome versions and React-Native).

* Expose `RTCRtpSender/Receiver` objects into `Producer` and `Consumer`? I don't like it because the app could change simulcast settings, etc, without lib knowledge. May be just expose an API to get native local stats (also in `Transport` which would mean the `pc`).

* `transport.receive()` must fail if not supported. The app is supposed to call  `device.canReceive()` first. The server side `transport.receive()` would fail and return an error.

* Currently, if `transport.receive()` is called with unsupported RTP parameters, I don't know what will happen. Theoretically `handler.receive()` and its `pc.setRemoteDescription()` will fail, but I'm not sure how things become later...

* `package.json`: Set min node engine to `"node": ">=6.4"` once this issue is fixed: https://github.com/ibc/node-mediastreamtrack/issues/1
