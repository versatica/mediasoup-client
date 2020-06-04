"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Device_1 = require("./Device");
exports.Device = Device_1.Device;
exports.detectDevice = Device_1.detectDevice;
const types = require("./types");
exports.types = types;
/**
 * Expose mediasoup-client version.
 */
exports.version = '3.6.9';
/**
 * Expose parseScalabilityMode() function.
 */
var scalabilityModes_1 = require("./scalabilityModes");
exports.parseScalabilityMode = scalabilityModes_1.parse;
