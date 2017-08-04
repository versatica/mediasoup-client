# TODO

* `a=ssrc:label` is deprecated. `a=ssrc:msid` is not standard, but we know it's 100% needed in PlanB, so move to it.

* Lowcase codec names before matching.

* Also ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN

* Add `receiver.canReceive()` => Boolean based on RTP capabilities. Or better `transport.canReceive(receive)`?


# mediasoup 2.0.0 related TODO

* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).
