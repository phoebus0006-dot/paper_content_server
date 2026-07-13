// learning-downloader.js — 下载候选图片到受控 staging
var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function createLearningDownloader(stagingDir, logger) {
  logger = logger || {};

  function extFromUrl(srcUrl) {
    try {
      var u = new URL(srcUrl);
      var ext = path.extname(u.pathname).toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return ext;
    } catch(e) {}
    return '.bin';
  }

  function download(url) {
    return new Promise(function(resolve, reject) {
      var protocol = url.startsWith('https:') ? https : http;
      var ext = extFromUrl(url);
      var tempName = 'learn_' + crypto.randomBytes(8).toString('hex') + ext;
      var tempPath = path.join(stagingDir, tempName);
      var writeStream = null;

      function cleanupTemp() {
        if (writeStream) {
          try { writeStream.close(); } catch(e) {}
          try { writeStream.destroy(); } catch(e) {}
        }
        try { fs.unlinkSync(tempPath); } catch(e) {}
      }

      var req = protocol.get(url, function(res) {
        if (res.statusCode !== 200) {
          // Drain to free the socket, then reject (no file created yet)
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        writeStream = fs.createWriteStream(tempPath);
        res.pipe(writeStream);
        writeStream.on('finish', function() {
          writeStream.close(function() {
            resolve(tempPath);
          });
        });
        writeStream.on('error', function(e) {
          cleanupTemp();
          reject(e);
        });
      });

      req.on('error', function(e) {
        cleanupTemp();
        reject(e);
      });

      req.setTimeout(30000, function() {
        req.destroy();
        cleanupTemp();
        reject(new Error('Download timeout'));
      });
    });
  }

  function cleanup(filePath) {
    try { fs.unlinkSync(filePath); } catch(e) {}
  }

  return { download: download, cleanup: cleanup };
}

module.exports = { createLearningDownloader: createLearningDownloader };
