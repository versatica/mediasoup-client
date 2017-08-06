# TODO

* Notification for "room closed"?

* Rename events to past time ("close" => "closed", "pause" => paused"...)?

* Lowcase codec names before matching.

* Also ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN


# TODO in mediasoup 2.0.0 (server)

* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).

* Rename `numChannels` to `channels` everywhere? https://github.com/w3c/ortc/issues/738
