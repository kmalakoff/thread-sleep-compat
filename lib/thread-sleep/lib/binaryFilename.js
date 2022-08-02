var getAbi = require('node-abi').getAbi;
var pkg = require('../package.json');

module.exports = function binaryFilename(version, options) {
  options = {};
  platform = options.platform || process.platform;
  arch = options.arch || process.arch;
  target = options.target || 'node';
  return [pkg.name, 'v' + pkg.version, target, 'v' + getAbi(version, target), platform, arch].join('-');
};
