# TODO

* Properly match H264 parameters.

* Ignore FEC and RED feature codecs:
   - ulpfec
   - flexfec
   - x-ulpfecuc
   - red

* Should not ignore pseudo media codecs:
   - telephone-event
   - CN

* Document that, in v3, `tracks` given to mediasoup-client are stopped internally when the producer is closed or even if the method fails (`transport.send()`, `producer.replaceTrack()`), so the app may want to use a cloned track instead.

* Rename `xxxObj` to `xxxObject`.
