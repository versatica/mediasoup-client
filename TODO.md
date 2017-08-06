# TODO

* Rename events to past time ("close" => "closed", "pause" => paused"...)?

* Notification to indicate "paused"/"resumed" in Receiver.

* Lowcase codec names before matching.

* Also ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN


# mediasoup 2.0.0 related TODO

* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).
