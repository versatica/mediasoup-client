# mediasoup-client

JavaScript client side SDK for building [mediasoup](https://mediasoup.org) based applications.

**NOTE:** Work in progress. See the roadmap for [mediasoup 2.0.0](https://github.com/versatica/mediasoup/milestone/2).


## Usage

```js
import * as mediasoupClient from 'mediasoup-client';

// Create a Room.
const room = new mediasoupClient.Room();

// Create a Transport for sending our media.
const sendTransport = room.createTransport('send');

// Create a Transport for receiving media from remote Peers.
const recvTransport = room.createTransport('recv');

// Join the Room.
room.join()
  .then((peers) =>
  {
    // Handle Peers already in to the Room.
    for (let peer of peers)
    {
      handlePeer(peer);
    }
  })
  .then(() =>
  {
    // Get our mic and webcam.
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

    // Create Senders for audio and video.
    const audioSender = room.createSender(audioTrack);
    const videoSender = room.createSender(videoTrack);

    // Send our audio.
    sendTransport.send(audioSender)
      .then(() => console.log('sending our mic'));

    // Send our video.
    sendTransport.send(videoSender)
      .then(() => console.log('sending our webcam'));
  });

// Fired when we need to send a request to mediasoup server and get its
// response back.
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

// Fired when we need to send a notification to mediasoup server.
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

// Fired when a new remote Peer joins the Room.
room.on('newpeer', (peer) =>
{
  console.log('a new Peer joined the Room');

  // Handle the Peer.
  handlePeer(peer);
});

function handlePeer(peer)
{
  // Handle all the Receivers in the Peer.
  for (let receiver of peer.receivers)
  {
    handleReceiver(receiver);
  }

  // Fired when the remote Peer disconects from the Room.
  peer.on('leave', (appData) =>
  {
    console.log(`Peer ${peer.name} left the room`);
  });

  // Fired when the remote Peer adds a new Sender.
  peer.on('newreceiver', (receiver) =>
  {
    console.log('Got a new Receiver');

    // Handle the Receiver.
    handleReceiver(receiver);
  });
}

function handleReceiver(receiver)
{
  // Receive the Receiver over our receiving Transport.
  recvTransport.receive(receiver)
    .then((track) =>
    {
      console.log('new receiving MediaStreamTrack');
    });

  // Fired when the remote Peer closes his associated Sender.
  receiver.on('close', () =>
  {
    console.log('Receiver closed');
  });

  // Fired when the remote Peer pauses his associated Sender.
  receiver.on('pause', () =>
  {
    console.log('Receiver paused');
  });

  // Fired when the remote Peer resumes his associated Sender.
  receiver.on('resume', () =>
  {
    console.log('Receiver resumed');
  });
}
```


## Authors

* Iñaki Baz Castillo [[website](https://inakibaz.me)|[github](https://github.com/ibc/)]
* José Luis Millán [[github](https://github.com/jmillan/)]


## License

[ISC](./LICENSE)
