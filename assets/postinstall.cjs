"use strict";
/**
 * Postinstall script for thread-sleep-compat
 *
 * Downloads all platform-specific native binaries for old Node versions (< 0.12)
 * since we don't know which Node version will actually run this module.
 */ var spawn = require('child_process').spawn;
var exit = require('exit-compat');
var fs = require('fs');
var mkdirp = require('mkdirp-classic');
var os = require('os');
var path = require('path');
// Configuration
var GITHUB_REPO = 'kmalakoff/thread-sleep-compat';
// Path is relative to dist/cjs/scripts/ at runtime
var root = path.join(__dirname, '..');
var pkg = require(path.join(root, 'package.json'));
var BINARIES_VERSION = pkg.binaryVersion;
// ABI versions needed for Node < 0.12 (normalized to decimal strings)
// ABI 1: Node 0.8.x and earlier
// ABI 11: Node 0.10.x
// Note: ABI 14 (Node 0.11.x) skipped - unstable dev branch, not widely used
var ABI_VERSIONS = [
    'v1',
    'v11'
];
var isWindows = process.platform === 'win32' || /^(msys|cygwin)$/.test(process.env.OSTYPE);
function homedir() {
    return typeof os.homedir === 'function' ? os.homedir() : require('homedir-polyfill')();
}
function tmpdir() {
    return typeof os.tmpdir === 'function' ? os.tmpdir() : require('os-shim').tmpdir();
}
// Storage path in user's home directory
// Allow STC_HOME override for testing
var storagePath = process.env.STC_HOME || path.join(homedir(), '.stc');
var binDir = path.join(storagePath, 'bin');
var versionFile = path.join(binDir, 'version.txt');
/**
 * Get ALL architectures for the current platform
 * Old Node versions may run under emulation (Rosetta, QEMU, WoW64)
 * so we download all available binaries for the platform
 */ function getArchitectures() {
    if (isWindows) return [
        'ia32',
        'x64'
    ];
    if (process.platform === 'darwin') return [
        'arm64',
        'x64'
    ];
    if (process.platform === 'linux') return [
        'arm64',
        'arm',
        'x64'
    ];
    // Fallback to current arch for unknown platforms
    return [
        process.arch
    ];
}
/**
 * Get the download URL for the binary archive
 */ function getDownloadUrl(abiVersion, arch) {
    var platform = process.platform;
    var filename = [
        pkg.name,
        'node',
        abiVersion,
        platform,
        arch
    ].join('-');
    var archiveName = "".concat(filename, ".tar.gz");
    return {
        url: "https://github.com/".concat(GITHUB_REPO, "/releases/download/binaries-v").concat(BINARIES_VERSION, "/").concat(archiveName),
        filename: filename
    };
}
/**
 * Safely remove a file if it exists
 */ function removeIfExistsSync(filePath) {
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
 */ function copyFileSync(src, dest) {
    var content = fs.readFileSync(src);
    fs.writeFileSync(dest, content);
}
/**
 * Recursively copy a directory
 */ function copyDirSync(src, dest) {
    mkdirp.sync(dest);
    var files = fs.readdirSync(src);
    for(var i = 0; i < files.length; i++){
        var srcPath = path.join(src, files[i]);
        var destPath = path.join(dest, files[i]);
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
 */ function atomicRename(src, dest, callback) {
    fs.rename(src, dest, function(err) {
        if (!err) {
            callback(null);
            return;
        }
        // Cross-device link error - fall back to copy + delete
        if (err.code === 'EXDEV') {
            try {
                var stat = fs.statSync(src);
                if (stat.isDirectory()) {
                    copyDirSync(src, dest);
                    rmdirSyncRecursive(src);
                } else {
                    copyFileSync(src, dest);
                    fs.unlinkSync(src);
                }
                callback(null);
            } catch (copyErr) {
                callback(copyErr);
            }
            return;
        }
        callback(err);
    });
}
/**
 * Download using curl (macOS, Linux, Windows 10+)
 */ function downloadWithCurl(downloadUrl, destPath, callback) {
    var curl = spawn('curl', [
        '-L',
        '-f',
        '-s',
        '--connect-timeout',
        '30',
        '--max-time',
        '120',
        '-o',
        destPath,
        downloadUrl
    ]);
    curl.on('close', function(code) {
        if (code !== 0) {
            // curl exit codes: 22 = HTTP error (4xx/5xx), 28 = timeout, 56 = receive error (often 404 with -f)
            if (code === 22 || code === 56) {
                callback(new Error('HTTP 404'));
            } else if (code === 28) {
                callback(new Error('Connection timeout'));
            } else {
                callback(new Error("curl failed with exit code ".concat(code)));
            }
            return;
        }
        callback(null);
    });
    curl.on('error', function(err) {
        callback(err);
    });
}
/**
 * Download using PowerShell (Windows 7+ fallback)
 */ function downloadWithPowerShell(downloadUrl, destPath, callback) {
    var psCommand = 'Invoke-WebRequest -Uri "'.concat(downloadUrl, '" -OutFile "').concat(destPath, '" -UseBasicParsing');
    var ps = spawn('powershell', [
        '-NoProfile',
        '-Command',
        psCommand
    ]);
    ps.on('close', function(code) {
        if (code !== 0) {
            callback(new Error("PowerShell download failed with exit code ".concat(code)));
            return;
        }
        callback(null);
    });
    ps.on('error', function(err) {
        callback(err);
    });
}
/**
 * Download a file - tries curl first, falls back to PowerShell on Windows
 * Node 0.8's OpenSSL doesn't support TLS 1.2+ required by GitHub
 */ function downloadFile(downloadUrl, destPath, callback) {
    downloadWithCurl(downloadUrl, destPath, function(err) {
        var _err_message;
        if (!err) return callback(null);
        // If curl failed and we're on Windows, try PowerShell
        if (isWindows && (err === null || err === void 0 ? void 0 : (_err_message = err.message) === null || _err_message === void 0 ? void 0 : _err_message.indexOf('ENOENT')) >= 0) {
            downloadWithPowerShell(downloadUrl, destPath, callback);
            return;
        }
        callback(err);
    });
}
/**
 * Extract tar.gz archive
 * Available on: macOS, Linux, Windows 10+
 */ function extractArchive(archivePath, destDir, callback) {
    var tar = spawn('tar', [
        '-xzf',
        archivePath,
        '-C',
        destDir
    ]);
    tar.on('close', function(code) {
        if (code !== 0) {
            callback(new Error("tar failed with exit code ".concat(code)));
            return;
        }
        callback(null);
    });
    tar.on('error', function(err) {
        callback(err);
    });
}
/**
 * Recursively remove a directory (Node 0.8 compatible)
 */ function rmdirSyncRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    var files = fs.readdirSync(dirPath);
    for(var i = 0; i < files.length; i++){
        var filePath = path.join(dirPath, files[i]);
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
 */ function downloadBinary(abiVersion, arch, outDir, callback) {
    var info = getDownloadUrl(abiVersion, arch);
    var destDir = path.join(outDir, info.filename);
    // Check if binary already exists
    var bindingPath = path.join(destDir, 'build', 'Release', 'thread_sleep.node');
    if (fs.existsSync(bindingPath)) {
        callback(null, 'exists');
        return;
    }
    var timestamp = Date.now();
    var tempArchive = path.join(tmpdir(), "thread-sleep-compat-".concat(abiVersion, "-").concat(arch, "-").concat(timestamp, ".tar.gz"));
    var tempExtractDir = path.join(tmpdir(), "thread-sleep-compat-extract-".concat(abiVersion, "-").concat(arch, "-").concat(timestamp));
    downloadFile(info.url, tempArchive, function(downloadErr) {
        if (downloadErr) {
            removeIfExistsSync(tempArchive);
            callback(downloadErr);
            return;
        }
        // Create temp extraction directory
        mkdirp.sync(tempExtractDir);
        extractArchive(tempArchive, tempExtractDir, function(extractErr) {
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
            atomicRename(tempExtractDir, destDir, function(renameErr) {
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
 */ function getDownloadList() {
    var archs = getArchitectures();
    var downloads = [];
    for(var i = 0; i < ABI_VERSIONS.length; i++){
        for(var j = 0; j < archs.length; j++){
            downloads.push({
                abi: ABI_VERSIONS[i],
                arch: archs[j]
            });
        }
    }
    return downloads;
}
/**
 * Download binaries sequentially (callback-based for Node 0.8 compat)
 */ function downloadAll(downloads, outDir, index, results, callback) {
    if (index >= downloads.length) return callback(null, results);
    var item = downloads[index];
    console.log("postinstall: Downloading binary for ABI ".concat(item.abi, " (").concat(item.arch, ")..."));
    downloadBinary(item.abi, item.arch, outDir, function(err, status) {
        if (err) {
            results.push({
                abi: item.abi,
                arch: item.arch,
                error: err.message || String(err)
            });
        } else {
            results.push({
                abi: item.abi,
                arch: item.arch,
                status: status
            });
        }
        downloadAll(downloads, outDir, index + 1, results, callback);
    });
}
/**
 * Main installation function
 */ function main() {
    var platform = process.platform;
    var archs = getArchitectures();
    // Check if already installed with matching version
    if (fs.existsSync(versionFile)) {
        try {
            var installedVersion = fs.readFileSync(versionFile, 'utf8');
            if (installedVersion === BINARIES_VERSION) {
                console.log("postinstall: Binaries already installed (v".concat(BINARIES_VERSION, ")"));
                exit(0);
                return;
            }
            console.log("postinstall: Upgrading binaries from v".concat(installedVersion, " to v").concat(BINARIES_VERSION));
        } catch (_e) {
        // version file unreadable, continue with download
        }
    }
    console.log("postinstall: Installing thread-sleep-compat binaries for ".concat(platform, " (").concat(archs.join(', '), ")"));
    // Create output directory in user's home
    mkdirp.sync(binDir);
    var downloads = getDownloadList();
    downloadAll(downloads, binDir, 0, [], function(_err, results) {
        var succeeded = 0;
        var failed = 0;
        var existed = 0;
        for(var i = 0; i < results.length; i++){
            var r = results[i];
            if (r.error) {
                failed++;
                if (r.error.indexOf('404') >= 0) {
                    console.log("postinstall: Binary for ".concat(r.abi, "-").concat(r.arch, " not available"));
                } else {
                    console.log("postinstall: Failed to download ".concat(r.abi, "-").concat(r.arch, ": ").concat(r.error));
                }
            } else if (r.status === 'exists') {
                existed++;
            } else {
                succeeded++;
            }
        }
        if (succeeded > 0) {
            console.log("postinstall: Downloaded ".concat(succeeded, " binary(ies)"));
        }
        if (existed > 0) {
            console.log("postinstall: ".concat(existed, " binary(ies) already existed"));
        }
        if (failed === results.length) {
            console.log('');
            console.log("postinstall: No binaries available for ".concat(platform));
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
/* CJS INTEROP */ if (exports.__esModule && exports.default) { try { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) { exports.default[key] = exports[key]; } } catch (_) {}; module.exports = exports.default; }