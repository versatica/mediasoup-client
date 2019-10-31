"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = __importDefault(require("./Logger"));
const errors_1 = require("./errors");
const logger = new Logger_1.default('CommandQueue');
class CommandQueue {
    constructor() {
        // Closed flag.
        this._closed = false;
        // Queue of pending commands. Each command is a function that returns a
        // promise.
        this._commands = [];
    }
    close() {
        this._closed = true;
    }
    /**
     * @param {Function} command - Function that returns a promise.
     */
    push(command) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof command !== 'function') {
                logger.error('push() | given command is not a function: %o', command);
                throw new TypeError('given command is not a function');
            }
            return new Promise((resolve, reject) => {
                command._resolve = resolve;
                command._reject = reject;
                // Append command to the queue.
                this._commands.push(command);
                // And run it if the only command in the queue is the new one.
                if (this._commands.length === 1)
                    this._next();
            });
        });
    }
    _next() {
        return __awaiter(this, void 0, void 0, function* () {
            // Take the first command.
            const command = this._commands[0];
            if (!command)
                return;
            // Execute it.
            yield this._handleCommand(command);
            // Remove the first command (the completed one) from the queue.
            this._commands.shift();
            // And continue.
            this._next();
        });
    }
    _handleCommand(command) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._closed) {
                command._reject(new errors_1.InvalidStateError('closed'));
                return;
            }
            try {
                const result = yield command();
                if (this._closed) {
                    command._reject(new errors_1.InvalidStateError('closed'));
                    return;
                }
                // Resolve the command with the given result (if any).
                command._resolve(result);
            }
            catch (error) {
                logger.error('_handleCommand() failed: %o', error);
                // Reject the command with the error.
                command._reject(error);
            }
        });
    }
}
exports.default = CommandQueue;
