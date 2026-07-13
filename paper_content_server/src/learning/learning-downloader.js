// learning-downloader.js — 下载候选图片到受控 staging
// 加固:仅 HTTPS(除非 allowHttp)、HTTP 200 校验、Content-Type 白名单、
// Content-Length 预检查、流式字节上限、重定向上限、超时、错误时清理临时文件。
var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DEFAULT_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20MB
var DEFAULT_TIMEOUT = 30000;
var MAX_REDIRECTS = 5;
var ALLOWED_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function createLearningDownloader(stagingDir, logger, options) {
  logger = logger || {};
  options = options || {};
  var maxBytes = options.maxDownloadBytes || DEFAULT_MAX_DOWNLOAD_BYTES;
  var timeout = options.timeout || DEFAULT_TIMEOUT;
  var allowHttp = options.allowHttp || false;  // 默认只允许 HTTPS,测试 fixture 除外

  function cleanup(filePath) {
    try { fs.unlinkSync(filePath); } catch(e) {}
  }

  function resolveRedirect(location, base) {
    try { return new URL(location, base).toString(); }
    catch(e) { return location; }
  }

  function download(url, redirectCount) {
    redirectCount = redirectCount || 0;
    if (redirectCount > MAX_REDIRECTS) {
      return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise(function(resolve, reject) {
      var protocol;
      if (url.startsWith('https:')) protocol = https;
      else if (url.startsWith('http:')) protocol = http;
      else { reject(new Error('Invalid URL protocol')); return; }
      if (protocol === http && !allowHttp) {
        reject(new Error('Non-HTTPS not allowed')); return;
      }

      var tempName = 'learn_' + crypto.randomBytes(8).toString('hex') + '.tmp';
      var tempPath = path.join(stagingDir, tempName);

      // 确保目录存在
      if (!fs.existsSync(stagingDir)) {
        try { fs.mkdirSync(stagingDir, { recursive: true }); }
        catch(e) { reject(new Error('Staging dir unavailable: ' + e.message)); return; }
      }

      var writeStream = null;
      var bytesWritten = 0;
      var tooLarge = false;
      var aborted = false;
      var settled = false;

      function settle(fn, value) {
        if (settled) return;
        settled = true;
        fn(value);
      }
      function failClean(err) {
        aborted = true;
        try { req.destroy(); } catch(e) {}
        if (writeStream) {
          try { writeStream.end(function() { cleanup(tempPath); }); }
          catch(e) { cleanup(tempPath); }
        } else {
          cleanup(tempPath);
        }
        settle(reject, err);
      }

      var req = protocol.get(url, function(res) {
        // 处理 redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // drain
          var newUrl = resolveRedirect(res.headers.location, url);
          settle(resolve, download(newUrl, redirectCount + 1));
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          failClean(new Error('HTTP ' + res.statusCode));
          return;
        }

        var contentType = res.headers['content-type'] || '';
        var baseContentType = contentType.split(';')[0].trim().toLowerCase();
        if (ALLOWED_IMAGE_CONTENT_TYPES.indexOf(baseContentType) < 0) {
          res.resume();
          failClean(new Error('Invalid Content-Type: ' + contentType));
          return;
        }

        // Content-Length 预检查
        var contentLength = parseInt(res.headers['content-length'] || '0', 10);
        if (contentLength && contentLength > maxBytes) {
          res.resume();
          failClean(new Error('Content-Length exceeds limit: ' + contentLength + ' > ' + maxBytes));
          return;
        }

        writeStream = fs.createWriteStream(tempPath, { flags: 'wx' });

        res.on('data', function(chunk) {
          bytesWritten += chunk.length;
          if (bytesWritten > maxBytes && !tooLarge) {
            tooLarge = true;
            try { res.removeListener('data', this); } catch(e) {}
            try { req.destroy(); } catch(e) {}
            writeStream.end(function() {
              cleanup(tempPath);
              settle(reject, new Error('Stream exceeded limit: ' + bytesWritten + ' > ' + maxBytes));
            });
          }
        });

        res.pipe(writeStream);

        writeStream.on('finish', function() {
          if (tooLarge || aborted) return;
          settle(resolve, tempPath);
        });

        writeStream.on('error', function(e) {
          failClean(new Error('Write failed: ' + e.message));
        });

        res.on('error', function(e) {
          failClean(e);
        });
      });

      req.on('error', function(e) {
        failClean(e);
      });

      req.on('timeout', function() {
        failClean(new Error('Download timeout'));
      });

      req.setTimeout(timeout);
    });
  }

  return { download: download, cleanup: cleanup };
}

module.exports = {
  createLearningDownloader: createLearningDownloader,
  DEFAULT_MAX_DOWNLOAD_BYTES: DEFAULT_MAX_DOWNLOAD_BYTES,
  DEFAULT_TIMEOUT: DEFAULT_TIMEOUT,
  MAX_REDIRECTS: MAX_REDIRECTS,
  ALLOWED_IMAGE_CONTENT_TYPES: ALLOWED_IMAGE_CONTENT_TYPES,
};
