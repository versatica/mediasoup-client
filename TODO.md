# TODO

* Properly match H264 parameters.

* Ignore FEC and RED feature codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red

* Should not ignore pseudo media codecs:
  * telephone-event
  * CN

* In Firefox, if the PC has no active send/recv tracks, its transport is closed via DTLS CLOSE ALERT (https://bugzilla.mozilla.org/show_bug.cgi?id=1355486), so we can avoid SDP O/A if there are 0 active tracks, (and leave only one) or we can react on DTLS CLOSE ALERT in the server, notify it to the client, and reset the handler.
  - Or we can have a fake DataChannel, but Firefox does also close the DTLS if there is no audio/video tracks.
  - This is for both sending and receiving PeerConnections.

* Implement `getStats()` in browsers? or better report uniformely from mediasoup?

* Implement `sender.replaceTrack(newTrack)`.


# TODO in mediasoup 2.0.0 (server)

* Rename `RtpReceiver` to `Producer` and `RtpSender` to `Consumer`
* 
* mediasoup should accept `peer.createTransport()` by passing a `transportId` number. The same for `RtpReceiver`.

* mediasoup should provide `const transport = peer.Transport()` rather than `createTransport()` (that returns a Promise).

* May have to react on DTLS ALERT CLOSE in the server and make it "really" close the Transport and notify the client. Bufff... I don't like this...

* mediasoup must ignore a `resumeReceiver` request (so re-enabling a client `Sender`) if it was remotely paused in mediasoup. However, mediasoup `RtpReceiver` must also keep state about `locallyPaused` and `remotelyPaused`.

* mediasoup must be ready for the case in which the client closes a `Transport` on which a `RtpReceiver` was running.
