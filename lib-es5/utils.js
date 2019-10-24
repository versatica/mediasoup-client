"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.randomNumber = randomNumber;
exports.clone = clone;

var _randomNumber = _interopRequireDefault(require("random-number"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var randomNumberGenerator = _randomNumber["default"].generator({
  min: 10000000,
  max: 99999999,
  integer: true
});
/**
 * Generates a random positive number between 10000000 and 99999999.
 *
 * @return {Number}
 */


function randomNumber() {
  return randomNumberGenerator();
}
/**
 * Clones the given Object/Array.
 *
 * @param {Object|Array} obj
 *
 * @return {Object|Array}
 */


function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}