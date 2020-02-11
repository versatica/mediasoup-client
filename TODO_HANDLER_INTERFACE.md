# TODO HandlerInterface

* `Device` constructor no longer accepts `Handler` as a class. It now accepts any of `handlerName` (string) or `handlerFactory` (both optionals, just one of them can be given) and still allows `Handler` as a string with a deprecated notice log.

* `RemoteSdp.ts`: Must define `plainRtpParameters` somehow.
