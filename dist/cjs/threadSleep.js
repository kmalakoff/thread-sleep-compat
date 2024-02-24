"use strict";
var major = +process.versions.node.split(".")[0];
var minor = +process.versions.node.split(".")[1];
if (major > 0 || minor >= 12) {
    module.exports = require("thread-sleep");
} else {
    try {
        module.exports = require("../../assets/thread-sleep");
    } catch (err) {
        console.log(err);
        module.exports = function() {};
    }
}
/* CJS INTEROP */ if (exports.__esModule && exports.default) { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) exports.default[key] = exports[key]; module.exports = exports.default; }