import assert from 'assert';
import { spawn } from 'child_process';
import fs from 'fs';
import Module from 'module';
import os from 'os';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

const root = path.join(__dirname, '..', '..');
const postinstallScript = path.join(root, 'assets', 'postinstall.cjs');
const pkg = _require(path.join(root, 'package.json'));
const BINARIES_VERSION = pkg.binaryVersion;

function tmpdir(): string {
  return typeof os.tmpdir === 'function' ? os.tmpdir() : require('os-shim').tmpdir();
}

/**
 * Run postinstall script with STC_HOME set to a temp directory
 */
function runPostinstall(stcHome: string, callback: (err: Error | null, stdout: string, stderr: string) => void) {
  const child = spawn(process.execPath, [postinstallScript], {
    env: { ...process.env, STC_HOME: stcHome },
    cwd: root,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      callback(new Error(`postinstall exited with code ${code}: ${stderr}`), stdout, stderr);
      return;
    }
    callback(null, stdout, stderr);
  });

  child.on('error', (err) => {
    callback(err, stdout, stderr);
  });
}

/**
 * Recursively remove a directory
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

describe('postinstall', function () {
  this.timeout(120000); // Downloads can take time

  let tempDir: string;

  beforeEach(() => {
    // Create unique temp directory for each test
    tempDir = path.join(tmpdir(), `stc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    rmdirSyncRecursive(tempDir);
  });

  it('should download binaries on fresh install', (done) => {
    runPostinstall(tempDir, (err, stdout) => {
      if (err) return done(err);

      // Check version file was created
      const versionFile = path.join(tempDir, 'bin', 'version.txt');
      assert(fs.existsSync(versionFile), 'version.txt should exist');
      assert.strictEqual(fs.readFileSync(versionFile, 'utf8'), BINARIES_VERSION);

      // Check output indicates download
      assert(stdout.indexOf('Installing') >= 0 || stdout.indexOf('Downloading') >= 0, 'Should indicate downloading');

      done();
    });
  });

  it('should skip download when version matches', (done) => {
    // First run - download binaries
    runPostinstall(tempDir, (err1) => {
      if (err1) return done(err1);

      // Second run - should skip
      runPostinstall(tempDir, (err2, stdout2) => {
        if (err2) return done(err2);

        // Check output indicates skip
        assert(stdout2.indexOf('already installed') >= 0, `Should indicate already installed. Got: ${stdout2}`);

        done();
      });
    });
  });

  it('should upgrade when version changes', (done) => {
    // First run - download binaries
    runPostinstall(tempDir, (err1) => {
      if (err1) return done(err1);

      // Modify version file to simulate old version
      const versionFile = path.join(tempDir, 'bin', 'version.txt');
      fs.writeFileSync(versionFile, '0.0.0', 'utf8');

      // Second run - should upgrade
      runPostinstall(tempDir, (err2, stdout2) => {
        if (err2) return done(err2);

        // Check output indicates upgrade
        assert(stdout2.indexOf('Upgrading') >= 0, `Should indicate upgrading. Got: ${stdout2}`);

        // Check version was updated
        assert.strictEqual(fs.readFileSync(versionFile, 'utf8'), BINARIES_VERSION);

        done();
      });
    });
  });
});
