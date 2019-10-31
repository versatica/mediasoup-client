import debug from 'debug';
export default class Logger {
    private _debug;
    private _warn;
    private _error;
    constructor(prefix?: string);
    readonly debug: debug.Debugger;
    readonly warn: debug.Debugger;
    readonly error: debug.Debugger;
}
//# sourceMappingURL=Logger.d.ts.map