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
  dtlsParameters: {}
}
```

Response:

```js
{
  dtlsParameters: {},
  dceParameters: {},
  iceCandidates: []
}
```


### createReceiver

Request:

```js
{
  type: 'createReceiver',
  id: ¿?,
  rtpParameters: {}
}
```

Response:

```js
{
  
}
```
