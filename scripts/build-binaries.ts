import spawn from 'cross-spawn-cb';
import extract from 'fast-extract';
import fs from 'fs';
import path from 'path';
import Queue from 'queue-cb';
import url from 'url';

import '../dist/cjs/lib/patchVersions.js';
import binaryFilename from '../dist/cjs/lib/binaryFilename.js';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// Known architectures per platform (using process.arch values)
const PLATFORM_ARCHS: Record<string, string[]> = {
  darwin: ['x64', 'arm64'],
  linux: ['x64', 'arm64', 'arm'],
  win32: ['x64', 'ia32'],
};

// Known ABIs for Node < 0.12 (normalized to decimal strings)
// ABI 1: Node 0.8.x and earlier
// ABI 11: Node 0.10.x
// Note: ABI 14 (Node 0.11.x) skipped - unstable dev branch, not widely used
const ABIS = [
  { abi: '1', version: '0.8.28' },
  { abi: '11', version: '0.10.48' },
];

function findBuilds() {
  const builds: Array<{ abi: string; version: string; arch: string }> = [];
  const archs = PLATFORM_ARCHS[process.platform] || [process.arch];

  for (const { abi, version } of ABIS) {
    for (const arch of archs) {
      builds.push({ abi, version, arch });
    }
  }

  return builds;
}

function buildOutput(build, callback) {
  const filename = binaryFilename(build.version, {
    arch: build.arch,
  });
  const src = path.join(root, 'prebuilds', ''.concat(filename.replace(pkg.name, ''.concat(pkg.name, '-v').concat(pkg.version)), '.tar.gz'));
  const dest = path.join(root, 'out', filename);
  const queue = new Queue(1);
  queue.defer((callback) => {
    fs.stat(src, (err) => {
      if (!err) return callback(); // exists
      const prebuild = path.join(root, 'node_modules', '.bin', 'prebuild');
      spawn(
        prebuild,
        ['--backend', 'cmake-js', '-t', build.version, '-a', build.arch],
        {
          stdio: 'inherit',
        },
        (err) => {
          console.log(''.concat(filename, ' ').concat(err ? 'failed. Reason: '.concat(err.message) : 'succeeded'));
          return callback();
        }
      );
    });
  });
  queue.defer((callback) => {
    fs.stat(src, (err) => {
      if (err) return callback(); // src does not exist
      fs.stat(dest, (err) => {
        if (!err) return callback(); // exists
        extract(src, dest, {}, callback);
      });
    });
  });
  queue.await((err) => {
    err ? callback(err) : callback(null, path.relative(root, dest));
  });
}

function buildBinaries(callback) {
  const builds = findBuilds();
  const outputs = [];
  const queue = new Queue(1);
  builds.forEach((build) => {
    queue.defer((cb) => {
      buildOutput(build, (err, output) => {
        if (err) return cb(err);
        outputs.push(output);
        cb();
      });
    });
  });
  queue.await((err) => {
    err ? callback(err) : callback(null, outputs);
  });
}

buildBinaries((err, built) => {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(['Built:'].concat(built).join('\n  '));
  process.exit(0);
});
