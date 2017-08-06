# mediasoup-client

JavaScript client side SDK for building [mediasoup](https://mediasoup.org) based applications.

**NOTE:** Work in progress. See the roadmap for [mediasoup 2.0.0](https://github.com/versatica/mediasoup/milestone/2).


## Usage

```js
import * as mediasoupClient from 'mediasoup-client';

// Create a Room.
const room = new mediasoupClient.Room();

// Setup request+response exchange from mediasoup-client to mediasoup
// server.
room.on('request', (request, callback, errback) =>
{
  // Application's signaling request (up to the app).
  const signalingRequest =
  {
    type : 'mediasoup',
    body : request
  };

  // Send the request over the signaling channel (up to the app).
  mySignalingChannel.send(signalingRequest)
    .then((signalingResponse) =>
    {
      callback(signalingResponse.body);
    })
    .catch((error) =>
    {
      errback(error.toString());
    });
});

// Setup notifications from mediasoup-client to mediasoup server.
room.on('notify', (notification) =>
{
  // Application's signaling request (up to the app).
  const signalingRequest =
  {
    type : 'mediasoup',
    body : notification
  };

  // Send the request over the signaling channel (up to the app).
  mySignalingChannel.send(signalingRequest);
});

// Join the Room.
room.join()
  .then(() =>
  {
    // Get our audio and video.
    return navigator.mediaDevices.getUserMedia(
      {
        audio : true,
        video : true
      });
  })
  .then((stream) =>
  {
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    
    // Create a Transport for sending our media.
    const transport = room.createTransport('send');

    // Create Senders for audio and video.
    const audioSender = room.createSender(audioTrack);
    const videoSender = room.createSender(videoTrack);

    // Send our audio and video over the same Transport.
    return Promise.all(
      [
        transport.send(audioSender),
        transport.send(videoSender)
      ]);
  });
```


## Authors

* Iñaki Baz Castillo [[website](https://inakibaz.me)|[github](https://github.com/ibc/)]
* José Luis Millán [[github](https://github.com/jmillan/)]


## License

[ISC](./LICENSE)
