# TODO

* Rename events to past time ("close" => "closed", "pause" => paused"...)? Also, `peer.on('left')` rather than `peer.on('close')` looks nicer...

* Properly match H264 parameters.

* Ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN

* In Firefox, if the PC has no active send/recv tracks, its transport is closed via DTLS CLOSE ALERT (https://bugzilla.mozilla.org/show_bug.cgi?id=1355486), so we can avoid SDP O/A if there are 0 active tracks, (and leave only one) or we can react on DTLS CLOSE ALERT in the server, notify it to the client, and reset the handler.
  - Or we can have a fake DataChannel, but Firefox does also close the DTLS if there is no audio/video tracks.
  - This is for both sending and receiving PeerConnections.

* Implement `getStats()` in browsers? or better report uniformely from mediasoup?

* `sender.replaceTrack(newTrack)`.


# TODO in mediasoup 2.0.0 (server)

* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).

* Rename `numChannels` to `channels` everywhere? https://github.com/w3c/ortc/issues/738

* May have to react on DTLS ALERT CLOSE in the server and make it "really" close the Transport and notify the client. Bufff... I don't like this...
