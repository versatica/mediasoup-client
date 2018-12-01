## v3 TODO

* Remove `static get tag()` from handler classes. Instead use `Handler.name` which returns the class name :)

* Modernize handler classes for Opera Next versions!

* Update `bowser` to v2 (ask the author first since it's beta yet).

* Remove "unhandled" events stuff in producers and consumers since those belongs to a specific transport in v3, so when the transport is closed, all its producers and consumers are automatically closed.
  - TODO: "close" event in producers and consumers?

* Refactor `handler.remoteClosed()` (which just must happen when the ICE or DTLS is closed via DTLS alert).
  - TODO: mediasoup server should not close a `Transport` instance (nor its C++ `WebRtcTransport` instance) when its `DtlsTransport` is closed/failed. Instead it should reset its `DtlsTransport` instance.  

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

* Expose `RTCRtpSender/Reeiver` objects into `Producer` and `Consumer`? I don't like it because the app could change simulcast settings, etc, without lib knowledge. May be just expose an API to get native local stats.

* Don't forget `consumer.supported` stuff. Take into account that now we cannot know it in advance, but just after calling `transport.receive()` in client side... Or may be we can anticipate it in server side...
  - NO. See below.

* When creating a "recv" transport, we need to provide our local capabilities to the server-side transport, so it knows if the `consumer` is "supported".
  - NO. See below.

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

* Handlers now need a method to update transport remote parameters (specifically, the DTLS role).
