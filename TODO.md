# TODO

* Must check peerconnection "closed" state or related event (it may happen without calling close on it, although I think it shouldn't...). Investigate it. Some for ORTC XxxTransports, etc.

* Properly match H264 parameters.

* Ignore FEC and RED feature codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red

* Should not ignore pseudo media codecs:
  * telephone-event
  * CN


## v3

* Remove `static get tag()` from handler classes. Instead use `Handler.name` which returns the class name :)

* Modernize handler classes for Opera Next versions!

* Update `bowser` to v2 (ask the author first since it's beta yet).

* Remove "unhandled" events stuff in producers and consumers since those belongs to a specific transport in v3, so when the transport is closed, all its producers and consumers are automatically closed.
  - TODO: "close" event in producers and consumers?

* Refactor `handler.remoteClosed()` (which just must happen when the ICE or DTLS is closed via DTLS alert).
  - TODO: mediasoup server should not close a `Transport` instance (nor its C++ `WebRtcTransport` instance) when its `DtlsTransport` is closed/failed nor when its `IceServer` is closed (example: when all TCP connections are closed).
  - TODO: But note that, if the `IceServer` is closed, the transport's remote parameters (IPs, ports) should change later!

* Redo `transport.restartIce()`. It should be like:

```js
# In server:

transport.restartIce()
  .then((iceParameters) => send iceParameters to client);

# It client:

transport.restartIce(remoteIceParameters)
  .then(() => done);
```

* Remove `direction` stuff from server-side Transport.

* Remove "@needupdateproducer" in client and related stuff in server (it's just for old Chrome versions and React-Native).

* Rethink `appData` stuff.
