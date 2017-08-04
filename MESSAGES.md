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


### createTransport

Request:

```js
{
  method: 'createTransport',
  id: 1111,
  options: {},
  dtlsParameters: {},
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


### leave

Notification:

```js
{
  method: 'leave',
  notification: true,
  appData: Any
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


## From server to client


### newPeer

Notification:

```js
{
  method: 'newPeer',
  notification: true,
  name: 'alice',
  receivers: [],
  appData: Any
}
```


### newReceiver

Notification:

```js
{
  method: 'newReceiver',
  notification: true,
  id: 3333,
  kind: 'video',
  peerName: 'alice',
  rtpParameters: {},
  paused: false
  appData: Any
}
```
