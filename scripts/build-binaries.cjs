'use strict';
var fs = require('fs');
var path = require('path');
var find = require('lodash.find');
var Queue = require('queue-cb');
var spawn = require('cross-spawn-cb');
var NodeSemvers = require('node-semvers');
var getAbi = require('node-abi').getAbi;
var extract = require('fast-extract');

require('../dist/cjs/lib/patchVersions.cjs');
var binaryFilename = require('../dist/cjs/lib/binaryFilename.cjs');

var root = path.join(__dirname, '..');
var pkg = require(path.join(root, 'package.json'));

var versions = NodeSemvers.loadSync()
  .resolve('<=0.11.0')
  .filter(function (x) {
    return +x.split('.')[1] % 2 === 0;
  });

var FILE_PLATFORM_MAP = {
  win: 'win32',
  osx: 'darwin',
};
var PLAFORM_ARCHS = {};
require('node-filename-to-dist-paths')
  .getDists()
  .forEach(function (dist) {
    dist.files.forEach(function (file) {
      var parts = file.split('-');
      if (parts.length < 2) return;
      var platform = FILE_PLATFORM_MAP[parts[0]] || parts[0];
      var arch = parts[1];
      if (!PLAFORM_ARCHS[platform]) PLAFORM_ARCHS[platform] = [];
      if (PLAFORM_ARCHS[platform].indexOf(arch) < 0) PLAFORM_ARCHS[platform].push(arch);
    });
  });

function findBuilds() {
  var builds = [];
  versions.reverse().forEach(function (x) {
    var version = x.slice(1);
    var abi = null;
    try {
      abi = getAbi(version, 'node');
    } catch (_err) {
      return;
    }
    var found = find(builds, function (y) {
      return y.abi === abi;
    });
    if (!found) {
      var archs = PLAFORM_ARCHS[process.platform];
      for (var i = 0; i < archs.length; i++) {
        builds.push({
          abi: abi,
          version: version,
          arch: archs[i],
        });
      }
    }
  });
  return builds;
}

function buildOutput(build, callback) {
  var filename = binaryFilename(build.version, {
    arch: build.arch,
  });
  var src = path.join(root, 'prebuilds', ''.concat(filename.replace(pkg.name, ''.concat(pkg.name, '-v').concat(pkg.version)), '.tar.gz'));
  var dest = path.join(root, 'out', filename);
  var queue = new Queue(1);
  queue.defer(function (callback) {
    fs.stat(src, function (err) {
      if (!err) return callback(); // exists
      var prebuild = path.join(root, 'node_modules', '.bin', 'prebuild');
      spawn(
        prebuild,
        ['--backend', 'cmake-js', '-t', build.version, '-a', build.arch],
        {
          stdio: 'inherit',
        },
        function (err) {
          console.log(''.concat(filename, ' ').concat(err ? 'failed. Reason: '.concat(err.message) : 'succeeded'));
          return callback();
        }
      );
    });
  });
  queue.defer(function (callback) {
    fs.stat(src, function (err) {
      if (err) return callback(); // src does not exist
      fs.stat(dest, function (err) {
        if (!err) return callback(); // exists
        extract(src, dest, {}, callback);
      });
    });
  });
  queue.await(function (err) {
    err ? callback(err) : callback(null, path.relative(root, dest));
  });
}

function buildBinaries(callback) {
  var builds = findBuilds();
  var outputs = [];
  var queue = new Queue(1);
  builds.forEach(function (build) {
    queue.defer(function (cb) {
      buildOutput(build, function (err, output) {
        if (err) return cb(err);
        outputs.push(output);
        cb();
      });
    });
  });
  queue.await(function (err) {
    err ? callback(err) : callback(null, outputs);
  });
}

buildBinaries(function (err, built) {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(['Built:'].concat(built).join('\n  '));
  process.exit(0);
});
