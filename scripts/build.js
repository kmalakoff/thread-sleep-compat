#! /usr/bin/env node

require('../lib/polyfills');

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
versions = versions.filter(function (x) {
  return +x.split('.')[1] % 2 === 0;
});

var PLAFORM_ARCHS = {
  win32: ['x64', 'x86'],
  linux: ['x64', 'x86'],
  darwin: ['x64'],
};

var builds = [];
versions.reverse().forEach(function (x) {
  var version = x.slice(1);
  try {
    var abi = getAbi(version, 'node');
  } catch (err) {
    return;
  }
  var found = builds.find(function (y) {
    return y.abi === abi;
  });
  if (!found) {
    var archs = PLAFORM_ARCHS[process.platform];
    for (var i = 0; i < archs.length; i++) {
      builds.push({ abi: abi, version: version, arch: archs[i] });
    }
  }
});

var built = [];
function buildOutput(build, callback) {
  var filename = binaryFilename(build.version, { arch: build.arch });
  var src = path.resolve(__dirname, '..', 'prebuilds', filename.replace(pkg.name, pkg.name + '-v' + pkg.version) + '.tar.gz');
  var dest = path.resolve(__dirname, '..', 'out', filename);

  var q = new Queue(1);
  q.defer(function (callback) {
    access(src, function (err) {
      if (!err) return callback(); // exists

      spawn('prebuild', ['--backend', 'cmake-js', '-t', build.version, '-a', build.arch], {}, function (err) {
        console.log(filename + ' ' + (err ? 'failed' : 'succeeded'));
        return callback(err);
      });
    });
  });
  q.defer(function (callback) {
    access(src, function (err) {
      if (err) return callback(); // src does not exist

      access(dest, function (err) {
      if (!err) return callback(); // exists

      built.push(path.join('out', filename));
      extract(src, dest, {}, callback);
    });
  });
});
  q.await(callback);
}

var queue = new Queue(1);
for (var i = 0; i < builds.length; i++) queue.defer(buildOutput.bind(null, builds[i]));
queue.await(function (err) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(['Built:'].concat(built).join('\n  '));
  process.exit(0);
});
