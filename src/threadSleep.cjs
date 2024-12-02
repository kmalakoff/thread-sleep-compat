const major = +process.versions.node.split('.')[0];
const minor = +process.versions.node.split('.')[1];

if (major > 0 || minor >= 12) {
  module.exports = require('thread-sleep');
} else {
  try {
    module.exports = require('../../assets/thread-sleep');
  } catch (err) {
    console.log(err);
    module.exports = () => {};
  }
}
