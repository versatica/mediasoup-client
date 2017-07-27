# TODO

* I don't like that sender.id matches any track.id since it may be replaced later, etc.

* Signal sender.id in "createReceiver" command.

* Lowcase codec names before matching.

* Also ignore RED codecs and other pseudo-codecs:
  * ulpfec
  * flexfec
  * x-ulpfecuc
  * red
  * telephone-event
  * CN
