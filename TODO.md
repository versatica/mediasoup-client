# TODO

* In Chrome and Firefox, we cannot establish the ICE+DTLS if there is no, at least, ac active sending or receiving track (or datachannel?).

* I don't like that sender.id matches any track.id since it may be replaced later, etc.

* Signal sender.id in "newSender" command.

* Cannot set local DTLS role on recvPeerConnection because initial offer is set via setRemoteDescription(), so the browser decides its DTLS role.
