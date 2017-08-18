# Messages


## From client to server


### queryRoom

Get info about the server-side `Room`. 

Request:

```js
{
  method: 'queryRoom'
}
```

Response:

```js
{
  rtpCapabilities: {},
  mandatoryCodecPayloadTypes: []
}
```


### joinRoom

Join the server-side `Room`.
Other peers will be notified with a `newPeer` notification.

Request:

```js
{
  method: 'joinRoom',
  rtpCapabilities: {},
  appData: Any
}
```

Response:

```js
{
  peers: []
}
```


### leaveRoom

Leave the server-side `Room`.
Other peers will be notified with a `peerClosed` notification.

Notification:

```js
{
  method: 'leave',
  notification: true,
  appData: Any
}
```


### createTransport

Create a server-side `Transport`.

Request:

```js
{
  method: 'createTransport',
  id: 1111,
  options: {},
  dtlsParameters: {}, // Optional.
  appData: Any
}
```

Response:

```js
{
  iceParameters: {},
  iceCandidates: [],
  dtlsParameters: {}
}
```


### updateTransport

Provide pending local parameters (if needed) to a server-side `Transport`.

Notification:

```js
{
  method: 'updateTransport',
  notification: true,
  id: 1111,
  dtlsParameters: {}
}
```


### closeTransport

Close a server-side `Transport`.

Notification:

```js
{
  method: 'closeTransport',
  notification: true,
  id: 1111,
  appData: Any
}
```


### createProducer

Create a server-side `Producer` for sending media over the indicate `Transport`.
Other peers will be notified with a `newConsumer` notification.

Request:

```js
{
  method: 'createProducer',
  id: 2222,
  kind: 'audio',
  transportId: 1111,
  rtpParameters: {},
  paused: false,
  appData: Any
}
```

Response:

```js
{}
```


### closeProducer

Close a server-side `Producer`.
Other peers will be notified with a `consumerClosed` notification.

Notification:

```js
{
  method: 'closeProducer',
  notification: true,
  id: 2222,
  appData: Any
}
```


### pauseProducer

Pause a server-side `Producer`.
Other peers will be notified with a `consumerPaused` notification.

Notification:

```js
{
  method: 'pauseProducer',
  notification: true,
  id: 2222,
  appData: Any
}
```


### resumeProducer

Resume a server-side `Producer`.
Other peers will be notified with a `consumerResumed` notification.

Notification:

```js
{
  method: 'resumeProducer',
  notification: true,
  id: 2222,
  appData: Any
}
```


### enableConsumer

Enable the reception of media from a server-side `Consumer`.

Request:

```js
{
  method: 'enableConsumer',
  id: 3333,
  paused: false
}
```

Response:

```js
{}
```


### pauseConsumer

Pause the reception of media from a server-side `Consumer`.

Notification:

```js
{
  method: 'pauseConsumer',
  notification: true,
  id: 3333,
  appData: Any
}
```


### resumeConsumer

Resume the reception of media from a server-side `Consumer`.

Notification:

```js
{
  method: 'resumeConsumer',
  notification: true,
  id: 3333,
  appData: Any
}
```


## From server to client


### roomClosed

The server-side `Room` or my server-side `Peer` has been closed in the server.

Notification:

```js
{
  method: 'roomClosed',
  notification: true,
  appData: Any
}
```


### transportClosed

A server-side `Transport` has been closed in the server.

Notification:

```js
{
  method: 'transportClosed',
  notification: true,
  id: 1111,
  appData: Any
}
```


### newPeer

A new `Peer` has joined the server-side `Room`.

Notification:

```js
{
  method: 'newPeer',
  notification: true,
  name: 'alice',
  consumers:
  [
    {
      id: 5555,
      kind: 'audio',
      rtpParameters: {},
      paused: false,
      appData: Any
    }
  ],
  appData: Any
}
```


### peerClosed

A server-side `Peer` has been closed (it may have left the room or his server-side `Peer` has been closed in the server).

Notification:

```js
{
  method: 'peerClosed',
  notification: true,
  name: 'alice',
  appData: Any
}
```


### producerClosed

A server-side `Producer` has been closed in the server.

Notification:

```js
{
  method: 'producerClosed',
  notification: true,
  id: 2222,
  appData: Any
}
```


### producerPaused

A server-side `Producer` has been paused in the server.

Notification:

```js
{
  method: 'producerPaused',
  notification: true,
  id: 2222,
  appData: Any
}
```


### producerResumed

A server-side `Producer` has been resumed in the server.

Notification:

```js
{
  method: 'producerResumed',
  notification: true,
  id: 2222,
  appData: Any
}
```


### newConsumer

A new server-side `Consumer` has been created.

Notification:

```js
{
  method: 'newConsumer',
  notification: true,
  id: 3333,
  kind: 'video',
  peerName: 'alice',
  rtpParameters: {},
  paused: false
  appData: Any
}
```


### consumerClosed

A server-side `Consumer` has been closed (its originating `Peer` may have left the room, he may have closed it, or his server-side `Peer` or `Producer` may have been closed in the server).

Notification:

```js
{
  method: 'consumerClosed',
  notification: true,
  id: 3333,
  peerName: 'alice',
  appData: Any
}
```


### consumerPaused

A server-side `Consumer` has been paused (its originating `Peer` may have paused it, or his server-side `Producer` may have been paused in the server, or my associated `Consumer` may have been paused in the server).

Notification:

```js
{
  method: 'consumerPaused',
  notification: true,
  id: 3333,
  peerName: 'alice',
  appData: Any
}
```


### consumerResumed

A server-side `Consumer` has been resumed (its originating `Peer` may have resumed it, or his server-side `Producer` may have been resumed in the server, or my associated `Consumer` may have been resumed in the server).

Notification:

```js
{
  method: 'consumerResumed',
  notification: true,
  id: 3333,
  peerName: 'alice',
  appData: Any
}
```
