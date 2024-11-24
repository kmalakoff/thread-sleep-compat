"use strict";
var getAbi = require('node-abi').getAbi;
var pkg = require('../../package.json');
module.exports = function binaryFilename(version, options) {
    options = options || {};
    var platform = options.platform || process.platform;
    var arch = options.arch || process.arch;
    var target = options.target || 'node';
    return [
        pkg.name,
        target,
        "v".concat(getAbi(version, target)),
        platform,
        arch
    ].join('-');
};
/* CJS INTEROP */ if (exports.__esModule && exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) exports.default[key] = exports[key]; module.exports = exports.default; }