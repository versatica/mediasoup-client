# TODO

* Must check peerconnection "closed" state or related event (it may happen without calling close on it, although I think it shouldn't...). Investigate it. Some for ORTC XxxTransports, etc.

* Properly match H264 parameters.

* Ignore FEC and RED feature codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red

* Should not ignore pseudo media codecs:
  * telephone-event
  * CN


## v3

* Remove `static get tag()` from handler classes. Instead use `Handler.name` which returns the class name :)

* Modernize handler classes for Opera Next versions!

* Update `bowser` to v2 (ask the author first since it's beta yet).
