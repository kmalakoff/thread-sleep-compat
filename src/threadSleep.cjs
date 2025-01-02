const major = +process.versions.node.split('.')[0];
const minor = +process.versions.node.split('.')[1];

let threadSleep = null;

if (major === 0 && minor < 12) {
  try {
    threadSleep = require('../../assets/thread-sleep/index.cjs');
  } catch (err) {
    console.log(err);
    threadSleep = () => {};
  }
} else threadSleep = require('thread-sleep');

module.exports = threadSleep;
