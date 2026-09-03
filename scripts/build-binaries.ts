import spawn from 'cross-spawn-cb';
import fs from 'fs';
import path from 'path';
import Queue from 'queue-cb';
import url from 'url';

import binaryFilename from '../dist/cjs/lib/binaryFilename.js';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

interface Build {
  abi: string;
  version: string;
  arch: string;
  filename: string;
}

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
  const builds: Array<Build> = [];
  const archs = PLATFORM_ARCHS[process.platform] || [process.arch];

  for (const { abi, version } of ABIS) {
    for (const arch of archs) {
      builds.push({ abi, version, arch, filename: binaryFilename(version, { arch: arch as NodeJS.Architecture }) });
    }
  }

  return builds;
}

function buildOutput(build: Build, callback: (err?: Error | null, result?: string) => void) {
  const out = path.join(root, '.tmp', 'build', build.filename);
  const built = path.join(out, 'Release', 'thread_sleep.node');
  const dest = path.join(root, 'assets', 'thread-sleep', 'bin', build.filename);
  const cmakeJs = path.join(root, 'node_modules', '.bin', 'cmake-js');
  const queue = new Queue(1);
  queue.defer((callback) => {
    spawn(cmakeJs, ['compile', '--runtime', 'node', '--runtime-version', build.version, '--arch', build.arch, '--out', out], { stdio: 'inherit' }, callback);
  });
  queue.defer((callback) => {
    fs.stat(built, (err) => {
      err ? callback(new Error('cmake-js produced no addon at '.concat(path.relative(root, built)))) : callback();
    });
  });
  queue.defer((callback) => {
    fs.mkdir(dest, { recursive: true }, (err) => {
      err ? callback(err) : fs.copyFile(built, path.join(dest, 'thread_sleep.node'), callback);
    });
  });
  queue.await((err) => {
    err ? callback(err) : callback(null, path.relative(root, dest));
  });
}

// A target that fails to compile is reported, not swallowed: the rest still build, and the exit code says a target is missing
function buildBinaries(callback: (built: string[], failed: string[]) => void) {
  const builds = findBuilds();
  const built: string[] = [];
  const failed: string[] = [];
  const queue = new Queue(1);
  builds.forEach((build) => {
    queue.defer((cb) => {
      buildOutput(build, (err: Error | null | undefined, output: string | undefined) => {
        if (err) failed.push(''.concat(build.filename, ': ').concat(err.message));
        else if (output) built.push(output);
        cb();
      });
    });
  });
  queue.await(() => {
    callback(built, failed);
  });
}

buildBinaries((built: string[], failed: string[]) => {
  if (built.length) console.log(['Built:'].concat(built).join('\n  '));
  if (failed.length) {
    console.log(['Failed:'].concat(failed).join('\n  '));
    return process.exit(1);
  }
  process.exit(0);
});
