#! /usr/bin/env node

require('../polyfills');

var path = require('path');
var Queue = require('queue-cb');
var spawn = require('cross-spawn-cb');
var path = require('path');
var NodeSemvers = require('node-semvers');
var getAbi = require('node-abi').getAbi;
var extract = require('fast-extract');
var binaryFilename = require('../binaryFilename');

var semvers = NodeSemvers.loadSync();
var versions = semvers.resolve('<=0.11.0');
versions = versions.filter(function (x) {
  return +x.split('.')[1] === 8 || +x.split('.')[1] === 10;
});

var builds = [];
versions.reverse().forEach(function (x) {
  var version = x.slice(1);
  var abi = getAbi(version, 'node');
  var found = builds.find(function (y) {
    return y.abi === abi;
  });
  if (!found) builds.push({ abi: abi, version: version });
});

function buildOutput(build, callback) {
  var filename = binaryFilename(build.version);
  console.log(build, filename);
  spawn('prebuild', ['--backend', 'cmake-js', '-t', build.version], { stdio: 'inherit' }, function (err) {
    if (err) return callback(err);

    var src = path.resolve(__dirname, '..', 'prebuilds', filename + '.tar.gz');
    var dest = path.resolve(__dirname, '..', 'binaries', filename);
    extract(src, dest, {}, callback);
  });
}

var queue = new Queue(1);
for (i = 0; i < builds.length; i++) queue.defer(buildOutput.bind(null, builds[i]));
queue.await(function (err) {
  if (err) console.log(err);
  process.exit(err ? 1 : 0);
});
