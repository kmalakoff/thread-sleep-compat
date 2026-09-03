import Module from 'module';

import type { ThreadSleepFunction } from './types.ts';

const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

const major = +process.versions.node.split('.')[0];
const minor = +process.versions.node.split('.')[1];

let threadSleep: ThreadSleepFunction = null as unknown as ThreadSleepFunction;

if (major === 0 && minor < 12) {
  try {
    threadSleep = _require('../../assets/thread-sleep/index.cjs') as ThreadSleepFunction;
  } catch (err) {
    // The binaries ship with the package, so a missing one is an unsupported platform, not a transient failure
    throw new Error(`thread-sleep-compat: no prebuilt binary for ${process.platform}-${process.arch} on node ${process.versions.node} (${(err as Error).message})`);
  }
} else threadSleep = _require('thread-sleep') as ThreadSleepFunction;

export default threadSleep;
