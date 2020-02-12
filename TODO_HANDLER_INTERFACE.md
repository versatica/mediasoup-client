# TODO HandlerInterface

* `Device` constructor no longer accepts `Handler` as a class. It now accepts any of `handlerName` (string) or `handlerFactory` (both optionals, just one of them can be given) and still allows `Handler` as a string with a deprecated notice log.

* `Device.ts`: `DeviceOptions` exported, so must document it.

* `Device.ts`: Make `detectDevice()` private and undocument it.

* `PlainRtpParameters` defined in `Transport.ts`. Document it.

* Doc: document that client `getStats()` returns `Promise<RTCStatsReport>` instead of `Promise<any>`.
