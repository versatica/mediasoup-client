# Messages


## From client to server

List of requests (and success responses) and notifications sent by mediasoup-client.


### 'join' Request

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


### 'createTransport' Request

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


### 'createReceiver' Request

Request:

```js
{
  type: 'createReceiver',
  receiverId: 2222,
  transportId: 1111,
  rtpParameters: {}
}
```

Response:

```js
{}
```
