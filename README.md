# thread-sleep-compat

Synchronous thread sleep for Node.js 0.8 and newer.

Please see the original [thread-sleep](https://github.com/ForbesLindesay/thread-sleep.git) module for details.

## Installation

```sh
npm install thread-sleep-compat
```

## Usage

```js
var sleep = require('thread-sleep-compat');

var start = Date.now();
var res = sleep(1000);
var end = Date.now();
// res is the actual time that we slept for
console.log(res + ' ~= ' + (end - start) + ' ~= 1000');
// Example output: 1005 ~= 1010 ~= 1000
```

`sleep(ms)` blocks the current thread and returns the actual sleep duration in milliseconds. It throws when `ms` is negative, non-integer, outside the supported range, or not a number.

Node 0.x versions below 0.12 use bundled native binaries. Newer Node versions use the `thread-sleep` dependency.

## License

MIT
