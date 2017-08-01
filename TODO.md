# TODO

* Lowcase codec names before matching.

* Also ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN

* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).

* Client's `room.createTransport()` should accept mediasoup transport options and also TURN settings.

* `room.createSender(track)` must check whether the room offers compatible codecs for `track.kind` and, if not, throw error. Also, `room.canSend(kind)` is required for the app to query whether it can send audio/video.

* REQUEST_TIMEOUT must be a Room setting.
