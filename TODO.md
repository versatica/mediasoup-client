# TODO


## DataChannel

* When `DataProducer` is returned by `transport.produceData()`, it may already be connected (readyState = 'open'), so the does not need to wait for "onopen" event.
  - Document it.

* Do `maxRetransmits` and `maxPacketLifeTime` affect to a receiver DC?
  - NO.

* https://blog.mozilla.org/webrtc/how-to-avoid-data-channel-breaking/

* BUG in Chrome: https://bugs.chromium.org/p/webrtc/issues/detail?id=10727
