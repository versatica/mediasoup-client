# Request

List of requests sent by mediasoup-client.


### join

Request:

```js
{
  type: 'join'
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
  type: 'createTransport',
  transportId: 1234,
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
  type: 'createReceiver',
  receiverId: ,
  rtpParameters: {}
}
```

Response:

```js
{
  
}
```
