"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debug = exports.detectDevice = exports.Device = exports.version = exports.types = void 0;
const debug_1 = __importDefault(require("debug"));
exports.debug = debug_1.default;
const Device_1 = require("./Device");
Object.defineProperty(exports, "Device", { enumerable: true, get: function () { return Device_1.Device; } });
Object.defineProperty(exports, "detectDevice", { enumerable: true, get: function () { return Device_1.detectDevice; } });
const types = __importStar(require("./types"));
exports.types = types;
/**
 * Expose mediasoup-client version.
 */
exports.version = '3.6.37';
/**
 * Expose parseScalabilityMode() function.
 */
var scalabilityModes_1 = require("./scalabilityModes");
Object.defineProperty(exports, "parseScalabilityMode", { enumerable: true, get: function () { return scalabilityModes_1.parse; } });
