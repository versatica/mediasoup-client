"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Device_1 = __importDefault(require("./Device"));
exports.Device = Device_1.default;
const types = __importStar(require("./types"));
exports.types = types;
/**
 * Expose mediasoup-client version.
 */
exports.version = '3.3.0-pre1';
/**
 * Expose parseScalabilityMode() function.
 */
var scalabilityModes_1 = require("./scalabilityModes");
exports.parseScalabilityMode = scalabilityModes_1.parse;
