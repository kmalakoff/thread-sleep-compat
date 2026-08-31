import assert from 'assert';
import threadSleep from 'thread-sleep-compat';

describe('exports .mjs', () => {
  it('default', () => {
    assert.equal(typeof threadSleep, 'function');
  });
});
