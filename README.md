# mediasoup-client

[![][npm-shield-mediasoup-client]][npm-mediasoup-client]

JavaScript client side SDK for building [mediasoup](https://mediasoup.org) based applications.


## Website and documentation

* [mediasoup.org][mediasoup-website]


## Usage example

```js
import * as mediasoupClient from 'mediasoup-client';
import mySignalingChannel from './mySignalingChannel';

// mySignalingChannel is our app custom signaling mechanism to communicate
// with the server running the mediasoup Node.js app.
// 
// Here we assume that a mediasoup Room and a Peer (named 'alice') already
// exist in the server. This channel will be used to communicate with our
// associated remote Peer (among other custom messages exhange up to the app).
const channel = new mySignalingChannel(
  {
    url      : 'wss://myserver.test',
    peerName : 'alice',
    roomId   : 'demo1'
  }); 

// Create a local Room instance associated to the remote Room.
const room = new mediasoupClient.Room();

// Transport for sending our media.
let sendTransport;

// Transport for receiving media from remote Peers.
let recvTransport;


// Join the remote Room.
room.join('alice')
  .then((peers) =>
  {
    // Create the Transport for sending our media.
    sendTransport = room.createTransport('send');

    // Create the Transport for receiving media from remote Peers.
    recvTransport = room.createTransport('recv');

    // Handle Peers already in to the Room.
    for (const peer of peers)
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

    // Create Producers for audio and video.
    const audioProducer = room.createProducer(audioTrack);
    const videoProducer = room.createProducer(videoTrack);

    // Send our audio.
    audioProducer.send(sendTransport)
      .then(() => console.log('sending our mic'));

    // Send our video.
    videoProducer.send(sendTransport)
      .then(() => console.log('sending our webcam'));
  });


// Event fired when a new remote Peer joins the Room.
room.on('newpeer', (peer) =>
{
  console.log('a new Peer joined the Room: %s', peer.name);

  // Handle the Peer.
  handlePeer(peer);
});


// Be ready to send mediasoup client requests to our remote mediasoup Peer in
// the server, and also deal with their associated responses.
room.on('request', (request, callback, errback) =>
{
  channel.send({ type: 'mediasoup-request', body: request })
    .then((response) =>
    {
      // Success response, so pass the mediasoup response to the local Room.
      callback(response.body);
    })
    .catch((error) =>
    {
      // Error response, so pass the error to the local Room.
      errback(error);
    });
});


// Be ready to send mediasoup client notifications to our remote mediasoup
// Peer in the server
room.on('notify', (notification) =>
{
  channel.send({ type: 'mediasoup-notification', body: notification });
});


// Be ready to receive mediasoup notifications from our remote mediasoup Peer
// in the server.
channel.on('message', (message) =>
{
  if (message.type === 'mediasoup-notification')
  {
    // Pass the mediasoup notification to the local Room.
    room.receiveNotification(message.body);
  }
  else
  {
    // Handle here app custom messages (chat, etc).
  }
});


function handlePeer(peer)
{
  // Handle all the Consumers in the Peer.
  for (const consumer of peer.consumers)
  {
    handleConsumer(consumer);
  }

  // Event fired when the remote Room or Peer is closed.
  peer.on('close', () =>
  {
    console.log('Peer closed');
  });

  // Event fired when the remote Peer sends a new media to mediasoup server.
  peer.on('newconsumer', (consumer) =>
  {
    console.log('Got a new Consumer');

    // Handle the Consumer.
    handleConsumer(consumer);
  });
}


function handleConsumer(consumer)
{
  // Receive the media over our receiving Transport.
  consumer.receive(recvTransport)
    .then((track) =>
    {
      console.log('receiving a new remote MediaStreamTrack');

      // Attach the track to a MediaStream and play it.
    });

  // Event fired when the Consumer is closed.
  consumer.on('close', () =>
  {
    console.log('Consumer closed');
  });
}
```


## Authors

* Iñaki Baz Castillo [[website](https://inakibaz.me)|[github](https://github.com/ibc/)]
* José Luis Millán [[github](https://github.com/jmillan/)]


## License

[ISC](./LICENSE)




[mediasoup-website]: https://mediasoup.org
[npm-shield-mediasoup-client]: https://img.shields.io/npm/v/mediasoup-client.svg
[npm-mediasoup-client]: https://npmjs.org/package/mediasoup-client
