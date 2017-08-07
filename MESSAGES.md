# Messages


## From client to server


### join

Request:

```js
{
  method: 'join',
  appData: Any
}
```

Response:

```js
{
  rtpCapabilities: {},
  peers: []
}
```


### leave

Notification:

```js
{
  method: 'leave',
  notification: true,
  appData: Any
}
```


### createTransport

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

Notification:

```js
{
  method: 'closeTransport',
  notification: true,
  id: 1111,
  appData: Any
}
```


### createReceiver

Request:

```js
{
  method: 'createReceiver',
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


### closeReceiver

Notification:

```js
{
  method: 'closeReceiver',
  notification: true,
  id: 2222,
  appData: Any
}
```


### pauseReceiver

Notification:

```js
{
  method: 'pauseReceiver',
  notification: true,
  id: 2222,
  appData: Any
}
```


### resumeReceiver

Notification:

```js
{
  method: 'resumeReceiver',
  notification: true,
  id: 2222,
  appData: Any
}
```


### enableSender

Request:

```js
{
  method: 'enableSender',
  id: 3333,
  rtpSettings:
  {
    useRtx: true
  }
}
```

Response:

```js
{}
```


### pauseSender

Notification:

```js
{
  method: 'pauseSender',
  notification: true,
  id: 3333,
  appData: Any
}
```


### resumeSender

Notification:

```js
{
  method: 'resumeSender',
  notification: true,
  id: 3333,
  appData: Any
}
```


## From server to client


### roomClosed

The remote `Room` has been closed.

Notification:

```js
{
  method: 'roomClosed',
  notification: true,
  appData: Any
}
```


### transportClosed

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

Notification:

```js
{
  method: 'newPeer',
  notification: true,
  name: 'alice',
  senders:
  [
    {
      id: 5555,
      kind: 'alice',
      rtpParameters: {},
      paused: false,
      appData: Any
    }
  ],
  appData: Any
}
```


### peerClosed

Notification:

```js
{
  method: 'peerClosed',
  notification: true,
  name: 'alice',
  appData: Any
}
```


### receiverClosed

Notification:

```js
{
  method: 'receiverClosed',
  notification: true,
  id: 2222,
  appData: Any
}
```


### receiverPaused

Notification:

```js
{
  method: 'receiverPaused',
  notification: true,
  id: 2222,
  appData: Any
}
```


### receiverResumed

Notification:

```js
{
  method: 'receiverResumed',
  notification: true,
  id: 2222,
  appData: Any
}
```


### newSender

Notification:

```js
{
  method: 'newSender',
  notification: true,
  id: 3333,
  kind: 'video',
  peerName: 'alice',
  rtpParameters: {},
  paused: false
  appData: Any
}
```


### senderClosed

Notification:

```js
{
  method: 'senderClosed',
  notification: true,
  id: 3333,
  peerName: 'alice',
  appData: Any
}
```


### senderPaused

Notification:

```js
{
  method: 'senderPaused',
  notification: true,
  id: 3333,
  peerName: 'alice',
  appData: Any
}
```


### senderResumed

Notification:

```js
{
  method: 'senderResumed',
  notification: true,
  id: 3333,
  peerName: 'alice',
  appData: Any
}
```
