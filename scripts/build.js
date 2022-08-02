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
  if (!found) builds.push({ abi: abi, version: version });
});

var built = [];

function buildOutput(build, callback) {
  spawn('prebuild', ['--backend', 'cmake-js', '-t', build.version], { stdio: 'inherit' }, function (err) {
    if (err) return callback(err);

    var filename = binaryFilename(build.version);
    var src = path.resolve(__dirname, '..', 'prebuilds', filename.replace(pkg.name, pkg.name + '-v' + pkg.version) + '.tar.gz');
    var dest = path.resolve(__dirname, '..', 'out', filename);

    access(dest, function (err) {
      if (!err) return callback(); // exists
      built.push(path.join('out', filename));
      extract(src, dest, {}, callback);
    });
  });
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
