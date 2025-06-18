import spawn from 'cross-spawn-cb';
import extract from 'fast-extract';
import fs from 'fs';
import find from 'lodash.find';
import { getAbi } from 'node-abi';
import { getDists } from 'node-filename-to-dist-paths';
import NodeVersions from 'node-semvers';
import path from 'path';
import Queue from 'queue-cb';
import url from 'url';

import '../dist/cjs/lib/patchVersions.cjs';
import binaryFilename from '../dist/cjs/lib/binaryFilename.cjs';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const versions = NodeVersions.loadSync()
  .resolve('<=0.11.0')
  .filter((x) => +x.split('.')[1] % 2 === 0);

const FILE_PLATFORM_MAP = {
  win: 'win32',
  osx: 'darwin',
};
const PLAFORM_ARCHS = {};
getDists().forEach((dist) => {
  dist.files.forEach((file) => {
    const parts = file.split('-');
    if (parts.length < 2) return;
    const platform = FILE_PLATFORM_MAP[parts[0]] || parts[0];
    const arch = parts[1];
    if (!PLAFORM_ARCHS[platform]) PLAFORM_ARCHS[platform] = [];
    if (PLAFORM_ARCHS[platform].indexOf(arch) < 0) PLAFORM_ARCHS[platform].push(arch);
  });
});

function findBuilds() {
  const builds = [];
  versions.reverse().forEach((x) => {
    const version = x.slice(1);
    let abi = null;
    try {
      abi = getAbi(version, 'node');
    } catch (_err) {
      return;
    }
    const found = find(builds, (y) => y.abi === abi);
    if (!found) {
      const archs = PLAFORM_ARCHS[process.platform];
      for (let i = 0; i < archs.length; i++) {
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
