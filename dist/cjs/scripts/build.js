"use strict";
require('../patchVersions');
var path = require('path');
var Queue = require('queue-cb');
var spawn = require('cross-spawn-cb');
var NodeSemvers = require('node-semvers');
var getAbi = require('node-abi').getAbi;
var access = require('fs-access-compat');
var extract = require('fast-extract');
var binaryFilename = require('../lib/binaryFilename');
var pkg = require('../package.json');
var semvers = NodeSemvers.loadSync();
var versions = semvers.resolve('<=0.11.0');
versions = versions.filter(function(x) {
    return +x.split('.')[1] % 2 === 0;
});
var PLAFORM_ARCHS = {
    win32: [
        'x64',
        'x86',
        'arm'
    ],
    linux: [
        'x64',
        'x86',
        'arm64',
        'armv7l',
        'armv6l',
        'ppc64le',
        's390x'
    ],
    darwin: [
        'x64',
        'x86',
        'arm64'
    ]
};
var builds = [];
versions.reverse().forEach(function(x) {
    var version = x.slice(1);
    try {
        var _abi = getAbi(version, 'node');
    } catch (_err) {
        return;
    }
    var found = builds.find(function(y) {
        return y.abi === abi;
    });
    if (!found) {
        var archs = PLAFORM_ARCHS[process.platform];
        for(var i = 0; i < archs.length; i++){
            builds.push({
                abi: abi,
                version: version,
                arch: archs[i]
            });
        }
    }
});
var built = [];
function buildOutput(build, callback) {
    var filename = binaryFilename(build.version, {
        arch: build.arch
    });
    var src = path.resolve(__dirname, '..', 'prebuilds', "".concat(filename.replace(pkg.name, "".concat(pkg.name, "-v").concat(pkg.version)), ".tar.gz"));
    var dest = path.resolve(__dirname, '..', 'out', filename);
    var q = new Queue(1);
    q.defer(function(callback) {
        access(src, function(err) {
            if (!err) return callback(); // exists
            var prebuild = path.resolve(__dirname, '..', 'node_modules', '.bin', 'prebuild');
            spawn(prebuild, [
                '--backend',
                'cmake-js',
                '-t',
                build.version,
                '-a',
                build.arch
            ], {}, function(err) {
                console.log("".concat(filename, " ").concat(err ? 'failed' : 'succeeded'));
                return callback();
            });
        });
    });
    q.defer(function(callback) {
        access(src, function(err) {
            if (err) return callback(); // src does not exist
            access(dest, function(err) {
                if (!err) return callback(); // exists
                built.push(path.join('out', filename));
                extract(src, dest, {}, callback);
            });
        });
    });
    q.await(callback);
}
var queue = new Queue(1);
for(var i = 0; i < builds.length; i++)queue.defer(buildOutput.bind(null, builds[i]));
queue.await(function(err) {
    if (err) {
        console.log(err);
        process.exit(1);
    }
    console.log([
        'Built:'
    ].concat(built).join('\n  '));
    process.exit(0);
});
/* CJS INTEROP */ if (exports.__esModule && exports.default) { try { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) { exports.default[key] = exports[key]; } } catch (_) {}; module.exports = exports.default; }