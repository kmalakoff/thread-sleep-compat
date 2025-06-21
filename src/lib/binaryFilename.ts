import { getAbi } from 'node-abi';
import path from 'path';

import type { Options } from '../types.ts';

const root = path.join(__dirname, '..', '..', '..');
const pkg = require(path.join(root, 'package.json'));

export default function binaryFilename(version: string, options: Options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const target = options.target || 'node';
  return [pkg.name, target, `v${getAbi(version, target)}`, platform, arch].join('-');
}
