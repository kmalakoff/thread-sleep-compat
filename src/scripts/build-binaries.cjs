const fs = require('fs');
const path = require('path');
const Queue = require('queue-cb');
const spawn = require('cross-spawn-cb');
const NodeSemvers = require('node-semvers');
const getAbi = require('node-abi').getAbi;

const extract = require('fast-extract');

require('../lib/patchVersions.cjs');
const binaryFilename = require('../lib/binaryFilename.cjs');

const root = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(root, 'package.json'));

const semvers = NodeSemvers.loadSync();
let versions = semvers.resolve('<=0.11.0');
versions = versions.filter((x) => +x.split('.')[1] % 2 === 0);

const PLAFORM_ARCHS = {
  aix: ['ppc64'],
  darwin: ['x64', 'arm64'],
  linux: ['arm64', 'armv6l', 'armv7l', 'ppc64', 'ppc64le', 's390x', 'x64', 'x86'],
  sunos: ['x64', 'x86'],
  win32: ['arm64', 'x64', 'x86', 'ia32'],
};

const builds = [];
versions.reverse().forEach((x) => {
  const version = x.slice(1);
  let abi = null;
  try {
    abi = getAbi(version, 'node');
  } catch (_err) {
    return;
  }
  const found = builds.find((y) => y.abi === abi);
  if (!found) {
    const archs = PLAFORM_ARCHS[process.platform];
    for (let i = 0; i < archs.length; i++) {
      builds.push({ abi: abi, version: version, arch: archs[i] });
    }
  }
});

const built = [];
function buildOutput(build, callback) {
  const filename = binaryFilename(build.version, { arch: build.arch });
  const src = path.join(root, 'prebuilds', `${filename.replace(pkg.name, `${pkg.name}-v${pkg.version}`)}.tar.gz`);
  const dest = path.join(root, 'out', filename);

  const q = new Queue(1);
  q.defer((callback) => {
    fs.stat(src, (err) => {
      if (!err) return callback(); // exists

      const prebuild = path.join(root, 'node_modules', '.bin', 'prebuild');
      spawn(prebuild, ['--backend', 'cmake-js', '-t', build.version, '-a', build.arch], { stdio: 'inherit' }, (err) => {
        console.log(`${filename} ${err ? `failed. Reason: ${err.message}` : 'succeeded'}`);
        return callback();
      });
    });
  });
  q.defer((callback) => {
    fs.stat(src, (err) => {
      if (err) return callback(); // src does not exist

      fs.stat(dest, (err) => {
        if (!err) return callback(); // exists

        built.push(path.join('out', filename));
        extract(src, dest, {}, callback);
      });
    });
  });
  q.await(callback);
}

const queue = new Queue(1);
for (let i = 0; i < builds.length; i++) queue.defer(buildOutput.bind(null, builds[i]));
queue.await((err) => {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(['Built:'].concat(built).join('\n  '));
  process.exit(0);
});
