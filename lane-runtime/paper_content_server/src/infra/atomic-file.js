// atomic-file.js — Atomic file write with temp + rename
// Temp file name includes pid + random to prevent concurrent-write collision.

var fs = require('fs');
var fsp = fs.promises;
var path = require('path');
var crypto = require('crypto');

function randomToken() {
  return crypto.randomBytes(8).toString('hex');
}

function writeFileAtomic(filePath, data, options) {
  options = options || {};
  var dir = path.dirname(filePath);
  var tempPath = path.join(dir, path.basename(filePath) + '.tmp.' + process.pid + '.' + randomToken());

  return fsp.writeFile(tempPath, data, options.encoding || 'utf8').then(function() {
    return fsp.rename(tempPath, filePath);
  }).catch(function(err) {
    // Attempt cleanup of temp file on failure
    return fsp.unlink(tempPath).catch(function() {}).then(function() {
      throw err;
    });
  });
}

module.exports = { writeFileAtomic: writeFileAtomic };
