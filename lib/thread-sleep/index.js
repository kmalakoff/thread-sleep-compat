var getAbi = require('node-abi').getAbi;
var pkg = require('./package.json');

var identifiers = [pkg.name, 'v' + pkg.version, 'node', 'v' + getAbi(process.versions.node), process.platform, process.arch];


// opts.pkg.name,
// '-v', opts.pkg.version,
// '-', opts.runtime || 'node',
// '-v', abi,
// '-', opts.platform,
// opts.libc,
// '-', opts.arch,


console.log('./prebuilds/' + identifiers.join('-'), process.versions);

var binding = require('./prebuilds/' + identifiers.join('-'));

module.exports = function sleep(milliseconds) {
  var start = Date.now();
  if (milliseconds !== Math.floor(milliseconds)) {
    throw new TypeError('sleep only accepts an integer number of milliseconds');
  } else if (milliseconds < 0) {
    throw new RangeError('sleep only accepts a positive number of milliseconds');
  } else if (milliseconds !== (milliseconds | 0)) {
    throw new RangeError('sleep duration out of range');
  }
  milliseconds = milliseconds | 0;
  var result = binding.sleep(milliseconds);
  var end = Date.now();
  return end - start;
};
