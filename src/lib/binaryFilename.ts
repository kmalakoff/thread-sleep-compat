const path = require('path');
const { getAbi } = require('node-abi');

const root = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(root, 'package.json'));

module.exports = function binaryFilename(version, options) {
  options = options || {};
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const target = options.target || 'node';
  return [pkg.name, target, `v${getAbi(version, target)}`, platform, arch].join('-');
};
