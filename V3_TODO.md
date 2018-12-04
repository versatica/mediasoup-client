## v3 TODO

* Update `bowser` to v2 (ask the author first since it's beta yet).

* Refactor `handler.remoteClosed()` (which just must happen when the ICE or DTLS is closed via DTLS alert).
  - TODO: mediasoup server should not close a `Transport` instance (nor its C++ `WebRtcTransport` instance) when its `DtlsTransport` is closed/failed. Instead it should reset its `DtlsTransport` instance.  

* Redo `transport.restartIce()`. It should be like:

```js
# In server:

transport.restartIce()
  .then((iceParameters) => send iceParameters to client);

# It client:

transport.restartIce({ remoteIceParameters })
  .then(() => done);
```

* Remove `direction` stuff from server-side Transport.

* Remove "@needupdateproducer" also in server (it's just for old Chrome versions and React-Native).

* Expose `RTCRtpSender/Receiver` objects into `Producer` and `Consumer`? I don't like it because the app could change simulcast settings, etc, without lib knowledge. May be just expose an API to get native local stats (also in `Transport` which would mean the `pc`).

* Should `transport.receive()` allow `preferredProfile` as argument?

* New proposal for Consumer stuff:

```js
/*
 * In server side. 
 */

// A new Producer is created.
// Get consumable RTP parameters via ortc.getConsumableRtpParameters().
const consumableRtpParameters = producer.getConsumableRtpParameters();

// Signal those params and the producer id to the client.
signaling.send('newconsumer', producerId, consumableRtpParameters);

/*
 * In client-side.
 */

// Check whether we support those consumableRtpParameters (codec
// compatibility and so on).
device.canReceive(consumableRtpParameters) // => boolean

// If so, receive it.
// This will generate a "receive" event with producerId,
// rtpCapabilities and appData as data that must be replied with
// remoteConsumerData (id, rtpParameters, and so on).
transport.receive({ producerId, appData })
  .then((consumer) => done)

/*
 * In server-side.
 */

// When "receive" command arrives, generate a Consumer and reply with its
// remoteConsumerData.
transport.receive({ producerId, rtpCapabilities, appData })
  .then((consumer) =>
  {
    // signal consumer.getData() to the client.
  });
```

* `transport.receive()` must fail if not supported. The app is supposed to call  `device.canReceive()` first. The server side `transport.receive()` would fail and return an error.
