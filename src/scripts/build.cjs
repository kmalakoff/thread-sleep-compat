require('../patchVersions');

const path = require('path');
const Queue = require('queue-cb');
const spawn = require('cross-spawn-cb');
const NodeSemvers = require('node-semvers');
const getAbi = require('node-abi').getAbi;
const access = require('fs-access-compat');

const extract = require('fast-extract');

const binaryFilename = require('../lib/binaryFilename');
const pkg = require('../package.json');

const semvers = NodeSemvers.loadSync();
let versions = semvers.resolve('<=0.11.0');
versions = versions.filter((x) => +x.split('.')[1] % 2 === 0);

const PLAFORM_ARCHS = {
  win32: ['x64', 'x86', 'arm'],
  linux: ['x64', 'x86', 'arm64', 'armv7l', 'armv6l', 'ppc64le', 's390x'],
  darwin: ['x64', 'x86', 'arm64'],
};

const builds = [];
versions.reverse().forEach((x) => {
  const version = x.slice(1);
  try {
    const _abi = getAbi(version, 'node');
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
  const src = path.resolve(__dirname, '..', 'prebuilds', `${filename.replace(pkg.name, `${pkg.name}-v${pkg.version}`)}.tar.gz`);
  const dest = path.resolve(__dirname, '..', 'out', filename);

  const q = new Queue(1);
  q.defer((callback) => {
    access(src, (err) => {
      if (!err) return callback(); // exists

      const prebuild = path.resolve(__dirname, '..', 'node_modules', '.bin', 'prebuild');
      spawn(prebuild, ['--backend', 'cmake-js', '-t', build.version, '-a', build.arch], {}, (err) => {
        console.log(`${filename} ${err ? 'failed' : 'succeeded'}`);
        return callback();
      });
    });
  });
  q.defer((callback) => {
    access(src, (err) => {
      if (err) return callback(); // src does not exist

      access(dest, (err) => {
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
