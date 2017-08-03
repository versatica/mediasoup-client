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
  transportId: 1111,
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
  receiverId: 2222,
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
  transportId: 1111,
  appData: Any
}
```


### closeReceiver

Notification:

```js
{
  method: 'closeReceiver',
  notification: true,
  receiverId: 2222,
  appData: Any
}
```


### pauseReceiver

Notification:

```js
{
  method: 'pauseReceiver',
  notification: true,
  receiverId: 2222,
  appData: Any
}
```


### resumeReceiver

Notification:

```js
{
  method: 'resumeReceiver',
  notification: true,
  receiverId: 2222,
  appData: Any
}
```


## From server to client


### newReceiver

Notification:

```js
{
  method: 'newReceiver',
  peerName: 'alice',
  receiverId: 3333,
  rtpParameters: {},
  paused: false
  appData: Any
}
```
