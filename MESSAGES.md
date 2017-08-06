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

Request:

```js
{
  method: 'pauseReceiver',
  id: 2222,
  appData: Any
}
```

Response:

```js
{}
```


### resumeReceiver

Request:

```js
{
  method: 'resumeReceiver',
  id: 2222,
  appData: Any
}
```

Response:

```js
{}
```


### enableSender

Request:

```js
{
  method: 'enableSender',
  id: 2222,
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


### playSender

Request:

```js
{
  method: 'playSender',
  id: 3333,
  appData: Any
}
```

Response:

```js
{}
```


### stopSender

Request:

```js
{
  method: 'stopSender',
  id: 3333,
  appData: Any
}
```

Response:

```js
{}
```


## From server to client


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
      id: 3333,
      kind: 'alice',
      rtpParameters: {},
      paused: false,
      appData: Any
    }
  ],
  appData: Any
}
```


### peerLeft

Notification:

```js
{
  method: 'peerLeft',
  notification: true,
  name: 'alice',
  appData: Any
}
```


### newSender

Notification:

```js
{
  method: 'newSender',
  notification: true,
  id: 4444,
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
  id: 4444,
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
  id: 4444,
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
  id: 4444,
  peerName: 'alice',
  appData: Any
}
```
