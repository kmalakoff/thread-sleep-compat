/**
 * Ensures test binaries exist before running tests.
 * Called as pretest hook - downloads from GitHub Releases if needed.
 *
 * Note: Local builds no longer work on modern toolchains (clang 17+)
 * due to V8 API incompatibilities with old Node headers.
 * Binaries are built on CI and downloaded via postinstall.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

function hasBinaries(): boolean {
  if (!fs.existsSync(OUT_DIR)) return false;

  // Check if there's at least one binary directory
  const entries = fs.readdirSync(OUT_DIR);
  return entries.some((entry) => {
    const bindingPath = path.join(OUT_DIR, entry, 'build', 'Release', 'thread_sleep.node');
    return fs.existsSync(bindingPath);
  });
}

function main(): void {
  // Skip if binaries already exist
  if (hasBinaries()) {
    console.log('Test binaries already exist, skipping download...');
    return;
  }

  console.log('Downloading test binaries from GitHub Releases...');
  execSync('node scripts/postinstall.cjs', {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

main();
