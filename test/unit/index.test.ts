import assert from 'assert';

// @ts-ignore
import sleep from 'thread-sleep-compat';

describe('thread-sleep-compat', () => {
  it('should sleep', () => {
    sleep(100);
  });

  it('should pass thread-sleep tests', () => {
    try {
      sleep('string' as unknown as number);
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
      // biome-ignore lint/style/useExponentiationOperator: Legacy
      sleep(Math.pow(2, 64));
      throw new Error('sleep with a very large integer should throw an error');
    } catch (ex) {
      assert(ex instanceof RangeError);
    }

    function abs(value) {
      return value < 0 ? value * -1 : value;
    }
    const start = Date.now();
    const res = sleep(1000) as number;
    const end = Date.now();
    assert(abs(1000 - res) < 200);
    assert(abs(1000 - (end - start)) < 200);
  });
});
