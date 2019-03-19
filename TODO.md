# TODO

* Document that `encodings` must be given from lowest to highest layer (index 0 must be the lowest layer).
  - This is this way even if later, in Firefox, we reverse the array.

* Document that, in v3, `tracks` given to mediasoup-client are stopped internally when the producer is closed or even if the method fails (`transport.send()`, `producer.replaceTrack()`), so the app may want to use a cloned track instead.

