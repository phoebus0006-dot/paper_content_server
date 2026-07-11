// custom-file-store.js — Quarantine → decode → move final path with atomicity
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

function createFileStore(quarantineDir, assetsDir, logger) {
  logger = logger || {};

  function storeQuarantine(filePath) {
    var id = crypto.randomBytes(8).toString('hex');
    var ext = path.extname(filePath) || '.bin';
    var dest = path.join(quarantineDir, 'q_' + id + ext);
    fs.copyFileSync(filePath, dest);
    return dest;
  }

  function decodeAndRecompute(quarantinePath) {
    var stat = fs.statSync(quarantinePath);
    var sha256 = crypto.createHash('sha256').update(fs.readFileSync(quarantinePath)).digest('hex');
    var mimeType = 'image/png';
    var ext = path.extname(quarantinePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    return { fileSize: stat.size, sha256: sha256, mimeType: mimeType };
  }

  function moveToAssets(quarantinePath, assetId) {
    var ext = path.extname(quarantinePath) || '.bin';
    var dest = path.join(assetsDir, assetId + ext);
    fs.renameSync(quarantinePath, dest);
    return dest;
  }

  function cleanup(filePath) {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) { logger.warn && logger.warn('cleanup: ' + e.message); }
  }

  return { storeQuarantine: storeQuarantine, decodeAndRecompute: decodeAndRecompute, moveToAssets: moveToAssets, cleanup: cleanup };
}
module.exports = { createFileStore: createFileStore };
