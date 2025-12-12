/**
 * Postinstall script for thread-sleep-compat
 *
 * Downloads all platform-specific native binaries for old Node versions (< 0.12)
 * since we don't know which Node version will actually run this module.
 */

import { spawn } from 'child_process';
import exit from 'exit-compat';
import fs from 'fs';
import mkdirp from 'mkdirp-classic';
import Module from 'module';
import os from 'os';
import path from 'path';
import url from 'url';

// CJS/ESM compatibility
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;
const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));

// Configuration
const GITHUB_REPO = 'kmalakoff/thread-sleep-compat';
// Path is relative to dist/cjs/scripts/ at runtime
const root = path.join(__dirname, '..', '..', '..');
const pkg = _require(path.join(root, 'package.json'));
const BINARIES_VERSION = pkg.binaryVersion;

// ABI versions needed for Node < 0.12 (normalized to decimal strings)
// ABI 1: Node 0.8.x and earlier
// ABI 11: Node 0.10.x
// Note: ABI 14 (Node 0.11.x) skipped - unstable dev branch, not widely used
const ABI_VERSIONS = ['v1', 'v11'];

type Callback = (err?: Error | null, status?: string) => void;
type ResultsCallback = (err: Error | null, results: DownloadResult[]) => void;

interface DownloadInfo {
  url: string;
  filename: string;
}

interface DownloadItem {
  abi: string;
  arch: string;
}

interface DownloadResult {
  abi: string;
  arch: string;
  status?: string;
  error?: string;
}

/**
 * Get ALL architectures for the current platform
 * Old Node versions may run under emulation (Rosetta, QEMU, WoW64)
 * so we download all available binaries for the platform
 */
function getArchitectures(): string[] {
  const platform = os.platform();

  if (platform === 'darwin') {
    return ['arm64', 'x64'];
  }
  if (platform === 'linux') {
    return ['arm64', 'arm', 'x64'];
  }
  if (platform === 'win32') {
    return ['ia32', 'x64'];
  }

  // Fallback to current arch for unknown platforms
  return [os.arch()];
}

/**
 * Get the download URL for the binary archive
 */
function getDownloadUrl(abiVersion: string, arch: string): DownloadInfo {
  const platform = os.platform();
  const filename = [pkg.name, 'node', abiVersion, platform, arch].join('-');
  const archiveName = `${filename}.tar.gz`;
  return {
    url: `https://github.com/${GITHUB_REPO}/releases/download/binaries-v${BINARIES_VERSION}/${archiveName}`,
    filename,
  };
}

/**
 * Get temp directory (compatible with Node 0.8)
 */
function getTmpDir(): string {
  return typeof os.tmpdir === 'function' ? os.tmpdir() : process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}

/**
 * Download using curl (macOS, Linux, Windows 10+)
 */
function downloadWithCurl(downloadUrl: string, destPath: string, callback: Callback): void {
  const curl = spawn('curl', ['-L', '-f', '-s', '-o', destPath, downloadUrl]);

  curl.on('close', (code) => {
    if (code !== 0) {
      // curl exit codes: 22 = HTTP error (4xx/5xx), 56 = receive error (often 404 with -f)
      if (code === 22 || code === 56) {
        callback(new Error('HTTP 404'));
      } else {
        callback(new Error(`curl failed with exit code ${code}`));
      }
      return;
    }
    callback(null);
  });

  curl.on('error', (err) => {
    callback(err);
  });
}

/**
 * Download using PowerShell (Windows 7+ fallback)
 */
function downloadWithPowerShell(downloadUrl: string, destPath: string, callback: Callback): void {
  const psCommand = `Invoke-WebRequest -Uri "${downloadUrl}" -OutFile "${destPath}" -UseBasicParsing`;
  const ps = spawn('powershell', ['-NoProfile', '-Command', psCommand]);

  ps.on('close', (code) => {
    if (code !== 0) {
      callback(new Error(`PowerShell download failed with exit code ${code}`));
      return;
    }
    callback(null);
  });

  ps.on('error', (err) => {
    callback(err);
  });
}

/**
 * Download a file - tries curl first, falls back to PowerShell on Windows
 * Node 0.8's OpenSSL doesn't support TLS 1.2+ required by GitHub
 */
function downloadFile(downloadUrl: string, destPath: string, callback: Callback): void {
  downloadWithCurl(downloadUrl, destPath, (err) => {
    if (!err) {
      callback(null);
      return;
    }

    // If curl failed and we're on Windows, try PowerShell
    if (os.platform() === 'win32' && err?.message?.indexOf('ENOENT') >= 0) {
      downloadWithPowerShell(downloadUrl, destPath, callback);
      return;
    }

    callback(err);
  });
}

/**
 * Extract tar.gz archive
 * Available on: macOS, Linux, Windows 10+
 */
function extractArchive(archivePath: string, destDir: string, callback: Callback): void {
  const tar = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
  tar.on('close', (code) => {
    if (code !== 0) {
      callback(new Error(`tar failed with exit code ${code}`));
      return;
    }
    callback(null);
  });
  tar.on('error', (err) => {
    callback(err);
  });
}

/**
 * Download and extract a single binary
 */
function downloadBinary(abiVersion: string, arch: string, outDir: string, callback: Callback): void {
  const info = getDownloadUrl(abiVersion, arch);
  const destDir = path.join(outDir, info.filename);

  // Check if binary already exists
  const bindingPath = path.join(destDir, 'build', 'Release', 'thread_sleep.node');
  if (fs.existsSync(bindingPath)) {
    callback(null, 'exists');
    return;
  }

  const tempPath = path.join(getTmpDir(), `thread-sleep-compat-${abiVersion}-${arch}-${Date.now()}.tar.gz`);

  downloadFile(info.url, tempPath, (downloadErr) => {
    if (downloadErr) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_e) {
          // ignore
        }
      }
      callback(downloadErr);
      return;
    }

    // Create destination directory before extracting
    mkdirp.sync(destDir);

    extractArchive(tempPath, destDir, (extractErr) => {
      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_e) {
          // ignore
        }
      }

      if (extractErr) {
        callback(extractErr);
        return;
      }

      callback(null, 'downloaded');
    });
  });
}

/**
 * Build list of all downloads needed (ABIs × architectures)
 */
function getDownloadList(): DownloadItem[] {
  const archs = getArchitectures();
  const downloads: DownloadItem[] = [];
  for (let i = 0; i < ABI_VERSIONS.length; i++) {
    for (let j = 0; j < archs.length; j++) {
      downloads.push({ abi: ABI_VERSIONS[i], arch: archs[j] });
    }
  }
  return downloads;
}

/**
 * Download binaries sequentially (callback-based for Node 0.8 compat)
 */
function downloadAll(downloads: DownloadItem[], outDir: string, index: number, results: DownloadResult[], callback: ResultsCallback): void {
  if (index >= downloads.length) {
    callback(null, results);
    return;
  }

  const item = downloads[index];
  console.log(`postinstall: Downloading binary for ABI ${item.abi} (${item.arch})...`);

  downloadBinary(item.abi, item.arch, outDir, (err, status) => {
    if (err) {
      results.push({ abi: item.abi, arch: item.arch, error: err.message || String(err) });
    } else {
      results.push({ abi: item.abi, arch: item.arch, status });
    }
    downloadAll(downloads, outDir, index + 1, results, callback);
  });
}

/**
 * Main installation function
 */
function main(): void {
  const platform = os.platform();
  const archs = getArchitectures();

  console.log(`postinstall: Installing thread-sleep-compat binaries for ${platform} (${archs.join(', ')})`);

  const outDir = path.join(root, 'out');

  // Create output directory
  mkdirp.sync(outDir);

  const downloads = getDownloadList();

  downloadAll(downloads, outDir, 0, [], (_err, results) => {
    let succeeded = 0;
    let failed = 0;
    let existed = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.error) {
        failed++;
        if (r.error.indexOf('404') >= 0) {
          console.log(`postinstall: Binary for ${r.abi}-${r.arch} not available`);
        } else {
          console.log(`postinstall: Failed to download ${r.abi}-${r.arch}: ${r.error}`);
        }
      } else if (r.status === 'exists') {
        existed++;
      } else {
        succeeded++;
      }
    }

    if (succeeded > 0) {
      console.log(`postinstall: Downloaded ${succeeded} binary(ies)`);
    }
    if (existed > 0) {
      console.log(`postinstall: ${existed} binary(ies) already existed`);
    }
    if (failed === results.length) {
      console.log('');
      console.log(`postinstall: No binaries available for ${platform}`);
      console.log('thread-sleep-compat will work on Node >= 0.12 but not on older versions.');
    }

    exit(0);
  });
}

main();
