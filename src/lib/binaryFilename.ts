import path from 'path';

import type { Options } from '../types.ts';

const root = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(root, 'package.json'));

// Get ABI for old Node versions (< 0.12)
// ABI 1: Node 0.8.x and earlier
// ABI 11: Node 0.10.x
function getAbiForOldNode(version: string): string {
  const parts = version.split('.');
  const minor = parseInt(parts[1], 10);
  if (minor < 10) return '1';
  return '11';
}

export default function binaryFilename(version: string, options: Options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const abi = getAbiForOldNode(version);
  return [pkg.name, 'node', `v${abi}`, platform, arch].join('-');
}
