/**
 * Postinstall script for thread-sleep-compat
 *
 * Downloads all platform-specific native binaries for old Node versions (< 0.12)
 * since we don't know which Node version will actually run this module.
 */

const { spawn } = require('child_process');
const exit = require('exit-compat');
const fs = require('fs');
const mkdirp = require('mkdirp-classic');
const os = require('os');
const path = require('path');

// Configuration
const GITHUB_REPO = 'kmalakoff/thread-sleep-compat';
// Path is relative to dist/cjs/scripts/ at runtime
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const BINARIES_VERSION = pkg.binaryVersion;

// ABI versions needed for Node < 0.12 (normalized to decimal strings)
// ABI 1: Node 0.8.x and earlier
// ABI 11: Node 0.10.x
// Note: ABI 14 (Node 0.11.x) skipped - unstable dev branch, not widely used
const ABI_VERSIONS = ['v1', 'v11'];

const isWindows = process.platform === 'win32' || /^(msys|cygwin)$/.test(process.env.OSTYPE);

function homedir(): string {
  return typeof os.homedir === 'function' ? os.homedir() : process.env.HOME || process.env.USERPROFILE || '/tmp';
}

function tmpdir(): string {
  return typeof os.tmpdir === 'function' ? os.tmpdir() : process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}

// Storage path in user's home directory
// Allow STC_HOME override for testing
const storagePath = process.env.STC_HOME || path.join(homedir(), '.stc');
const binDir = path.join(storagePath, 'bin');
const versionFile = path.join(binDir, 'version.txt');

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
  if (isWindows) return ['ia32', 'x64'];
  if (process.platform === 'darwin') return ['arm64', 'x64'];
  if (process.platform === 'linux') return ['arm64', 'arm', 'x64'];

  // Fallback to current arch for unknown platforms
  return [process.arch];
}

/**
 * Get the download URL for the binary archive
 */
function getDownloadUrl(abiVersion: string, arch: string): DownloadInfo {
  const { platform } = process;
  const filename = [pkg.name, 'node', abiVersion, platform, arch].join('-');
  const archiveName = `${filename}.tar.gz`;
  return {
    url: `https://github.com/${GITHUB_REPO}/releases/download/binaries-v${BINARIES_VERSION}/${archiveName}`,
    filename,
  };
}

/**
 * Safely remove a file if it exists
 */
function removeIfExistsSync(filePath: string): void {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_e) {
      // ignore cleanup errors
    }
  }
}

/**
 * Copy file contents
 */
function copyFileSync(src: string, dest: string): void {
  const content = fs.readFileSync(src);
  fs.writeFileSync(dest, content);
}

/**
 * Recursively copy a directory
 */
function copyDirSync(src: string, dest: string): void {
  mkdirp.sync(dest);
  const files = fs.readdirSync(src);
  for (let i = 0; i < files.length; i++) {
    const srcPath = path.join(src, files[i]);
    const destPath = path.join(dest, files[i]);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Atomic rename with fallback to copy+delete for cross-device moves
 * Works for both files and directories
 */
function atomicRename(src: string, dest: string, callback: Callback): void {
  fs.rename(src, dest, (err) => {
    if (!err) {
      callback(null);
      return;
    }
    // Cross-device link error - fall back to copy + delete
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      try {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          copyDirSync(src, dest);
          rmdirSyncRecursive(src);
        } else {
          copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
        callback(null);
      } catch (copyErr) {
        callback(copyErr as Error);
      }
      return;
    }
    callback(err);
  });
}

/**
 * Download using curl (macOS, Linux, Windows 10+)
 */
function downloadWithCurl(downloadUrl: string, destPath: string, callback: Callback) {
  const curl = spawn('curl', ['-L', '-f', '-s', '--connect-timeout', '30', '--max-time', '120', '-o', destPath, downloadUrl]);

  curl.on('close', (code) => {
    if (code !== 0) {
      // curl exit codes: 22 = HTTP error (4xx/5xx), 28 = timeout, 56 = receive error (often 404 with -f)
      if (code === 22 || code === 56) {
        callback(new Error('HTTP 404'));
      } else if (code === 28) {
        callback(new Error('Connection timeout'));
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
function downloadWithPowerShell(downloadUrl: string, destPath: string, callback: Callback) {
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
function downloadFile(downloadUrl: string, destPath: string, callback: Callback) {
  downloadWithCurl(downloadUrl, destPath, (err) => {
    if (!err) return callback(null);

    // If curl failed and we're on Windows, try PowerShell
    if (isWindows && err?.message?.indexOf('ENOENT') >= 0) {
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
function extractArchive(archivePath: string, destDir: string, callback: Callback) {
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
 * Recursively remove a directory (Node 0.8 compatible)
 */
function rmdirSyncRecursive(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(dirPath, files[i]);
    if (fs.statSync(filePath).isDirectory()) {
      rmdirSyncRecursive(filePath);
    } else {
      fs.unlinkSync(filePath);
    }
  }
  fs.rmdirSync(dirPath);
}

/**
 * Download and extract a single binary with atomic rename
 */
function downloadBinary(abiVersion: string, arch: string, outDir: string, callback: Callback) {
  const info = getDownloadUrl(abiVersion, arch);
  const destDir = path.join(outDir, info.filename);

  // Check if binary already exists
  const bindingPath = path.join(destDir, 'build', 'Release', 'thread_sleep.node');
  if (fs.existsSync(bindingPath)) {
    callback(null, 'exists');
    return;
  }

  const timestamp = Date.now();
  const tempArchive = path.join(tmpdir(), `thread-sleep-compat-${abiVersion}-${arch}-${timestamp}.tar.gz`);
  const tempExtractDir = path.join(tmpdir(), `thread-sleep-compat-extract-${abiVersion}-${arch}-${timestamp}`);

  downloadFile(info.url, tempArchive, (downloadErr) => {
    if (downloadErr) {
      removeIfExistsSync(tempArchive);
      callback(downloadErr);
      return;
    }

    // Create temp extraction directory
    mkdirp.sync(tempExtractDir);

    extractArchive(tempArchive, tempExtractDir, (extractErr) => {
      // Clean up temp archive
      removeIfExistsSync(tempArchive);

      if (extractErr) {
        rmdirSyncRecursive(tempExtractDir);
        callback(extractErr);
        return;
      }

      // Ensure parent directory exists
      mkdirp.sync(outDir);

      // Remove existing destDir if present (for upgrade case)
      rmdirSyncRecursive(destDir);

      // Atomic rename from temp to final location
      atomicRename(tempExtractDir, destDir, (renameErr) => {
        if (renameErr) {
          rmdirSyncRecursive(tempExtractDir);
          callback(renameErr);
          return;
        }
        callback(null, 'downloaded');
      });
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
function downloadAll(downloads: DownloadItem[], outDir: string, index: number, results: DownloadResult[], callback: ResultsCallback) {
  if (index >= downloads.length) return callback(null, results);

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
  const { platform } = process;
  const archs = getArchitectures();

  // Check if already installed with matching version
  if (fs.existsSync(versionFile)) {
    try {
      const installedVersion = fs.readFileSync(versionFile, 'utf8');
      if (installedVersion === BINARIES_VERSION) {
        console.log(`postinstall: Binaries already installed (v${BINARIES_VERSION})`);
        exit(0);
        return;
      }
      console.log(`postinstall: Upgrading binaries from v${installedVersion} to v${BINARIES_VERSION}`);
    } catch (_e) {
      // version file unreadable, continue with download
    }
  }

  console.log(`postinstall: Installing thread-sleep-compat binaries for ${platform} (${archs.join(', ')})`);

  // Create output directory in user's home
  mkdirp.sync(binDir);

  const downloads = getDownloadList();

  downloadAll(downloads, binDir, 0, [], (_err, results) => {
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

    // Write version file after successful installation
    if (succeeded > 0 || existed > 0) {
      try {
        fs.writeFileSync(versionFile, BINARIES_VERSION, 'utf8');
      } catch (_e) {
        // ignore version file write errors
      }
    }

    exit(0);
  });
}

main();
