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
/**
 * Get ALL architectures for the current platform
 * Old Node versions may run under emulation (Rosetta, QEMU, WoW64)
 * so we download all available binaries for the platform
 */ function getArchitectures() {
    var platform = os.platform();
    if (platform === 'darwin') {
        return [
            'arm64',
            'x64'
        ];
    }
    if (platform === 'linux') {
        return [
            'arm64',
            'arm',
            'x64'
        ];
    }
    if (platform === 'win32') {
        return [
            'ia32',
            'x64'
        ];
    }
    // Fallback to current arch for unknown platforms
    return [
        os.arch()
    ];
}
/**
 * Get the download URL for the binary archive
 */ function getDownloadUrl(abiVersion, arch) {
    var platform = os.platform();
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
 * Get temp directory (compatible with Node 0.8)
 */ function getTmpDir() {
    return typeof os.tmpdir === 'function' ? os.tmpdir() : process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
}
/**
 * Download using curl (macOS, Linux, Windows 10+)
 */ function downloadWithCurl(downloadUrl, destPath, callback) {
    var curl = spawn('curl', [
        '-L',
        '-f',
        '-s',
        '-o',
        destPath,
        downloadUrl
    ]);
    curl.on('close', function(code) {
        if (code !== 0) {
            // curl exit codes: 22 = HTTP error (4xx/5xx), 56 = receive error (often 404 with -f)
            if (code === 22 || code === 56) {
                callback(new Error('HTTP 404'));
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
        if (!err) {
            callback(null);
            return;
        }
        // If curl failed and we're on Windows, try PowerShell
        if (os.platform() === 'win32' && (err === null || err === void 0 ? void 0 : (_err_message = err.message) === null || _err_message === void 0 ? void 0 : _err_message.indexOf('ENOENT')) >= 0) {
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
 * Download and extract a single binary
 */ function downloadBinary(abiVersion, arch, outDir, callback) {
    var info = getDownloadUrl(abiVersion, arch);
    var destDir = path.join(outDir, info.filename);
    // Check if binary already exists
    var bindingPath = path.join(destDir, 'build', 'Release', 'thread_sleep.node');
    if (fs.existsSync(bindingPath)) {
        callback(null, 'exists');
        return;
    }
    var tempPath = path.join(getTmpDir(), "thread-sleep-compat-".concat(abiVersion, "-").concat(arch, "-").concat(Date.now(), ".tar.gz"));
    downloadFile(info.url, tempPath, function(downloadErr) {
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
        extractArchive(tempPath, destDir, function(extractErr) {
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
    if (index >= downloads.length) {
        callback(null, results);
        return;
    }
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
    var platform = os.platform();
    var archs = getArchitectures();
    console.log("postinstall: Installing thread-sleep-compat binaries for ".concat(platform, " (").concat(archs.join(', '), ")"));
    var outDir = path.join(root, 'out');
    // Create output directory
    mkdirp.sync(outDir);
    var downloads = getDownloadList();
    downloadAll(downloads, outDir, 0, [], function(_err, results) {
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
        exit(0);
    });
}
main();
/* CJS INTEROP */ if (exports.__esModule && exports.default) { try { Object.defineProperty(exports.default, '__esModule', { value: true }); for (var key in exports) { exports.default[key] = exports[key]; } } catch (_) {}; module.exports = exports.default; }