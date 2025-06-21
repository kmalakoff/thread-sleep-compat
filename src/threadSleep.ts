import Module from 'module';

import type { ThreadSleepFunction } from './types.ts';

const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

const major = +process.versions.node.split('.')[0];
const minor = +process.versions.node.split('.')[1];

let threadSleep: ThreadSleepFunction = null;

if (major === 0 && minor < 12) {
  try {
    threadSleep = _require('../../assets/thread-sleep/index.cjs') as ThreadSleepFunction;
  } catch (err) {
    console.log(err);
    threadSleep = () => {};
  }
} else threadSleep = _require('thread-sleep') as ThreadSleepFunction;

export default threadSleep;
