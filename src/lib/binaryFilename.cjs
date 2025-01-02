const path = require('path');
const moduleRoot = require('module-root-sync');
const { getAbi } = require('node-abi');

const root = moduleRoot(__dirname);
const pkg = require(path.join(root, 'package.json'));

module.exports = function binaryFilename(version, options) {
  options = options || {};
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const target = options.target || 'node';
  return [pkg.name, target, `v${getAbi(version, target)}`, platform, arch].join('-');
};
