var assert = require('assert');

var sleep = require('../../lib');

describe('thread-sleep-compat', function () {
  it('should sleep', function () {
    sleep(100);
  });

  it('should pass thread-sleep tests', function () {
    try {
      sleep('string');
      throw new Error('sleep with a string should throw an error');
    } catch (ex) {
      assert(ex instanceof TypeError);
    }
    try {
      sleep(-10);
      throw new Error('sleep with a negative number should throw an error');
    } catch (ex) {
      assert(ex instanceof RangeError);
    }
    try {
      sleep(1.5);
      throw new Error('sleep with a non-integer should throw an error');
    } catch (ex) {
      assert(ex instanceof TypeError);
    }
    try {
      sleep(Math.pow(2, 64));
      throw new Error('sleep with a very large integer should throw an error');
    } catch (ex) {
      assert(ex instanceof RangeError);
    }

    function abs(value) {
      return value < 0 ? value * -1 : value;
    }
    var start = Date.now();
    var res = sleep(1000);
    var end = Date.now();
    assert(abs(1000 - res) < 200);
    assert(abs(1000 - (end - start)) < 200);
  });
});
