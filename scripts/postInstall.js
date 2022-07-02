var Queue = require('queue-cb');
var crossSpawn = require('cross-spawn-cb');
var path = require('path');

var cwd = path.resolve(path.join(__dirname, '..', 'lib', 'thread-sleep'));
var pkg = require(path.resolve(__dirname, '..', 'package.json'));
var tsPkg = require(path.join(cwd, 'package.json'));

var queue = new Queue(1);
var deps = [];
for (var key in tsPkg.dependencies) deps.push(key + '@' + tsPkg.dependencies[key]);
queue.defer(crossSpawn.bind(null, 'npm', ['install', ...deps, '--omit=dev', '--no-package-lock', '--no-bin-links'], { cwd: cwd }));
queue.defer(
  crossSpawn.bind(
    null,
    'npm',
    ['install', '@mapbox/node-pre-gyp' + '@' + pkg.dependencies['@mapbox/node-pre-gyp'], '--omit=dev', '--no-package-lock', '--no-bin-links'],
    { cwd: cwd }
  )
);
queue.defer(crossSpawn.bind(null, 'node-pre-gyp', ['install', '--fallback-to-build', '--runtime=node', '--target=' + '0.8.0'], { cwd: cwd, stdio: 'inherit' }));
queue.defer(
  crossSpawn.bind(null, 'node-pre-gyp', ['install', '--fallback-to-build', '--runtime=node', '--target=' + '0.10.0'], { cwd: cwd, stdio: 'inherit' })
);
queue.await(function (err) {
  process.exit(err ? err.message : 0);
});
