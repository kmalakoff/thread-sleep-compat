import path from 'path';

export interface Options {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
}

const root = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(root, 'package.json'));

// ABI 1: Node 0.8.x and earlier; ABI 11: Node 0.10.x
// Node 0.11.x is ABI 14, an unstable dev branch that is not built
function getAbiForOldNode(version: string): string {
  const parts = version.split('.');
  const minor = parseInt(parts[1], 10);
  if (minor < 10) return '1';
  if (minor === 10) return '11';
  throw new Error(`no ABI built for node ${version}`);
}

export default function binaryFilename(version: string, options: Options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const abi = getAbiForOldNode(version);
  return [pkg.name, 'node', `v${abi}`, platform, arch].join('-');
}
