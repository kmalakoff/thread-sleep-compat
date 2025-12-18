var os = require('os');
var path = require('path');

/**
 * Get home directory (compatible with Node 0.8)
 */
function homedir() {
  if (typeof os.homedir === 'function') return os.homedir();
  return process.env.HOME || process.env.USERPROFILE || '/tmp';
}

var root = path.join(__dirname, '..', '..');
var dist = path.join(root, 'dist', 'cjs')
var binaryFilename = require(path.join(dist, 'lib', 'binaryFilename.js'));

// Binaries are cached in ~/.stc/bin/
// Allow STC_HOME override for testing
var storagePath = process.env.STC_HOME || path.join(homedir(), '.stc');
var binDir = path.join(storagePath, 'bin');
var bindingPath = path.join(binDir, binaryFilename.default(process.versions.node), 'build', 'Release', 'thread_sleep.node');
var binding = require(bindingPath);

module.exports = function sleep(milliseconds) {
  var start = Date.now();
  if (milliseconds !== Math.floor(milliseconds)) {
    throw new TypeError('sleep only accepts an integer number of milliseconds');
  }
  // biome-ignore lint/style/noUselessElse: <explanation>
  else if (milliseconds < 0) {
    throw new RangeError('sleep only accepts a positive number of milliseconds');
  }
  // biome-ignore lint/style/noUselessElse: <explanation>
  else if (milliseconds !== (milliseconds | 0)) {
    throw new RangeError('sleep duration out of range');
  }
  milliseconds = milliseconds | 0;
  binding.sleep(milliseconds);
  var end = Date.now();
  return end - start;
};
