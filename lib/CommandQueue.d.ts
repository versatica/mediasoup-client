export default class CommandQueue {
    private _closed;
    private readonly _commands;
    constructor();
    close(): void;
    /**
     * @param {Function} command - Function that returns a promise.
     */
    push(command: any): Promise<any>;
    _next(): Promise<any>;
    _handleCommand(command: any): Promise<void>;
}
//# sourceMappingURL=CommandQueue.d.ts.map