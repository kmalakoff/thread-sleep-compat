import { getAbi } from 'node-abi';
import path from 'path';

import type { Options } from '../types.ts';

const root = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(root, 'package.json'));

// Normalize ABI: convert hex strings (0x000B) to decimal strings (11)
// Note: Can't use startsWith - not available in Node 0.8/0.10
function normalizeAbi(abi: string): string {
  if (abi.indexOf('0x') === 0) return String(parseInt(abi, 16));
  return abi;
}

export default function binaryFilename(version: string, options: Options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const target = options.target || 'node';
  const abi = normalizeAbi(getAbi(version, target));
  return [pkg.name, target, `v${abi}`, platform, arch].join('-');
}
