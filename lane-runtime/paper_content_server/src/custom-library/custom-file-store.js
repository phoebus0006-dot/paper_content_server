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

  async function decodeAndRecompute(quarantinePath) {
    var stat = fs.statSync(quarantinePath);
    var buf = fs.readFileSync(quarantinePath);
    var sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    var ext = path.extname(quarantinePath).toLowerCase();
    var mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    var width = 0, height = 0;
    try {
      var sharp = require('sharp');
      var meta = await sharp(buf).metadata();
      if (meta) { mimeType = meta.format ? 'image/' + meta.format : mimeType; width = meta.width || 0; height = meta.height || 0; }
    } catch(e) { logger.warn && logger.warn('decode metadata failed: ' + e.message); }
    return { fileSize: stat.size, sha256: sha256, mimeType: mimeType, width: width, height: height };
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
