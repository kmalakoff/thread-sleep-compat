const assert = require('assert');
const threadSleep = require('thread-sleep-compat');

describe('exports .cjs', () => {
  it('default', () => {
    assert.equal(typeof threadSleep, 'function');
  });
});
