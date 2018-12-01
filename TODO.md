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

* Expose `RTCRtpSender/Reeiver` objects into `Producer` and `Consumer`? I don't like it because the app could change simulcast settings, etc, without lib knowledge. May be just expose an API to get native local stats.

* Don't forget `consumer.supported` stuff. Take into account that now we cannot know it in advance, but just after calling `transport.receive()` in client side... Or may be we can anticipate it in server side...
  - NO. See below.

* When creating a "recv" transport, we need to provide our local capabilities to the server-side transport, so it knows if the `consumer` is "supported".
  - NO. See below.

* `handler.addConsumer()` no longer has to return a Promise that resolves with a track, since `transport.receive()` must return a Promise that resolves with a consumer.

* Should `transport.receive()` allow `preferredProfile` as argument?

* Since consumers now are created directly in the server and then their data is sent to the client, it may happen that mediasoup server asks for a PLI and the corresponding keyframe reaches the client before the consumer data, so it would produce frozen video. Let's see.
  * May be the server-side Consumer should not be enabled (so no PLI requested) until we call `enable()` on it.

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

* Should transport "send" event also include `transportId`? or should it be up to the app to signal it in its custom request to the server? Same for "receive" event.

* `transport.receive()` must fail if not supported. The app is supposed to call  `device.canReceive()` first. The server side `transport.receive()` would fail and return an error.

* `handler.addProducer()` should not expect `producer.id` since that this time there is no yet `id`.
  * It's just about removing it since it's just used for logging.
