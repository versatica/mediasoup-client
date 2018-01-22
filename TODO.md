# TODO

* `appData` MUST always be an existing Object, so no setter but just a getter.

* Must check peerconnection "closed" state or related event (it may happen without calling close on it, although I think it shouldn't...). Investigate it. Some for ORTC XxxTransports, etc.

* We are allowing calling `room.join()` after closed, but this means that events are also duplicated when re-joined! NOTE: This is a user error, but must document it.

* Properly match H264 parameters.

* Ignore FEC and RED feature codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red

* Should not ignore pseudo media codecs:
  * telephone-event
  * CN


### React-Native (react-native-webrtc)
