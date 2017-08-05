# TODO


* Must check that we can receive a remote track before trying it.

* Add `receiver.canReceive()` => Boolean based on RTP capabilities. Or better `transport.canReceive(receive)`?

* Lowcase codec names before matching.

* Also ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN

* Rename `numChannels` to `channels` everywhere? https://github.com/w3c/ortc/issues/738


# mediasoup 2.0.0 related TODO

* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).
