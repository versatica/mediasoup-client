# mediasoup-client v3

*NOTE:* Work in progress.

<!--
[![][npm-shield-mediasoup-client]][npm-mediasoup-client]
-->

JavaScript client side SDK for building [mediasoup](https://mediasoup.org) based applications.


## Website and documentation

* [mediasoup.org][mediasoup-website]


## Usage example

```js
import { Device } from 'mediasoup-client';
import mySignaling from './my-signaling';

// Create a device (use browser auto-detection).
const device = new Device();

// Communicate with our server app to retrieve room RTP capabilities.
const roomRtpCapabilities = 
  await mySignaling.send('getRoomCapabilities');

// Load the device with the room RTP capabilities.
await device.load({ roomRtpCapabilities });

// Check whether we can send video to the room.
if (!device.canSend('video'))
{
  console.warn('cannot send video');

  // Abort next steps.
}

// Create a transport in the server for sending our media through it.
const sendTransportRemoteParameters = 
  await mySignaling.send('createTransport');

// Create the local representation of our server-side transport.
const sendTransport = device.createTransport(
  {
    transportRemoteParameters : sendTransportRemoteParameters,
    direction                 : 'send'
  });

// Set transport "connect" event handler.
sendTransport.on('connect', (transportLocalParameters, callback, errback) =>
{
  // Here we must communicate our remote transport our local parameters.
  try
  {
    await mySignaling.send(
      'transportParameters',
      { 
        id                  : sendTransport.id, 
        transportParameters : transportLocalParameters
      });

    // Done in the server, tell our transport.
    callback();
  }
  catch (error)
  {
    // Something was wrong in server side.
    errback(error);
  }
});

// Set transport "send" event handler.
sendTransport.on('connect', (producerLocalParameters, callback, errback) =>
{
  // Here we must communicate our remote transport the sending parameters.
  try
  {
    const producerRemoteParameters = await mySignaling.send(
      'send',
      { 
        id            : sendTransport.id, 
        rtpParameters : producerLocalParameters
      });

    // Done in the server, pass the response to our transport.
    callback(producerRemoteParameters);
  }
  catch (error)
  {
    // Something was wrong in server side.
    errback(error);
  }
});

// Send our webcam video.
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const webcamTrack = stream.getVideoTracks()[0];
const webcamProducer = sendTransport.send({ track: webcamTrack });
```


## Authors

* Iñaki Baz Castillo [[website](https://inakibaz.me)|[github](https://github.com/ibc/)]
* José Luis Millán [[github](https://github.com/jmillan/)]


## License

[ISC](./LICENSE)




[mediasoup-website]: https://mediasoup.org
[npm-shield-mediasoup-client]: https://img.shields.io/npm/v/mediasoup-client.svg
[npm-mediasoup-client]: https://npmjs.org/package/mediasoup-client
