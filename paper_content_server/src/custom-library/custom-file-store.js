// custom-file-store.js — Quarantine and final asset file management
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
function createFileStore(quarantineDir, assetsDir, logger) {
  logger = logger || {};
  function storeQuarantine(filePath) {
    var id = crypto.randomBytes(8).toString('hex');
    var dest = path.join(quarantineDir, 'q_' + id + path.extname(filePath));
    fs.copyFileSync(filePath, dest);
    return dest;
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
  return { storeQuarantine: storeQuarantine, moveToAssets: moveToAssets, cleanup: cleanup };
}
module.exports = { createFileStore: createFileStore };