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


### createProducer

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

Request:

```js
{
  method: 'enableConsumer',
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


### pauseConsumer

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
  consumers:
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


### producerClosed

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
