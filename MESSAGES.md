# Messages


## From client to server

List of request (with success responses) and notifications sent by mediasoup-client.


### join

Request:

```js
{
  method: 'join'
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
  dtlsParameters: {}
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
  rtpParameters: {}
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
  notification: true
}
```


### closeTransport

Notification:

```js
{
  method: 'closeTransport',
  notification: true,
  transportId: 1111
}
```


### closeReceiver

Notification:

```js
{
  method: 'closeReceiver',
  notification: true,
  receiverId: 2222
}
```


### pauseReceiver

Notification:

```js
{
  method: 'pauseReceiver',
  notification: true,
  receiverId: 2222
}
```


### resumeReceiver

Notification:

```js
{
  method: 'resumeReceiver',
  notification: true,
  receiverId: 2222
}
```
