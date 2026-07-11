// custom-library-service.js — Upload with real decode, safety gate, final path atomicity
var path = require('path');

function createCustomLibraryService(fileStore, validator, deduplicator, safetyGate, assetRepository, logger) {
  logger = logger || {};

  function processUpload(upload) {
    // 1. Validate metadata
    var v = validator.validate(upload);
    if (!v.ok) return Promise.resolve({ status: 'REJECTED', errors: v.errors });
    // 2. Quarantine
    var quarantinePath, decoded;
    try { quarantinePath = fileStore.storeQuarantine(upload.filePath); } catch(e) { return Promise.resolve({ status: 'ERROR', error: 'QUARANTINE_FAILED' }); }
    // 3. Real decode
    try { decoded = fileStore.decodeAndRecompute(quarantinePath); } catch(e) { fileStore.cleanup(quarantinePath); return Promise.resolve({ status: 'ERROR', error: 'DECODE_FAILED' }); }
    // 4. Safety gate
    if (safetyGate && !safetyGate.isSafe(quarantinePath)) { fileStore.cleanup(quarantinePath); return Promise.resolve({ status: 'REJECTED', reason: 'SAFETY' }); }
    // 5. Duplicate check
    return deduplicator.isDuplicate(decoded.sha256).then(function(dup) {
      if (dup) { fileStore.cleanup(quarantinePath); return { status: 'DUPLICATE', sha256: decoded.sha256 }; }
      // 6. Generate assetId, move to final path
      var am = require(path.join(__dirname, '..', 'assets', 'asset-model'));
      var assetId = am.createAsset({ sourceUrl: null, localPath: '/tmp', libraryType: 'CUSTOM',
        safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' }).assetId;
      var finalPath;
      try { finalPath = fileStore.moveToAssets(quarantinePath, assetId); } catch(e) { fileStore.cleanup(quarantinePath); return { status: 'ERROR', error: 'MOVE_FAILED' }; }
      // 7. Create asset referencing final path
      try {
        var asset = am.createAsset({
          assetId: assetId, sourceUrl: null, localPath: finalPath,
          libraryType: 'CUSTOM', sourceType: 'upload',
          sha256: decoded.sha256, mimeType: decoded.mimeType,
          width: upload.width, height: upload.height,
          safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
        });
        return assetRepository.create(asset).then(function(aid) {
          return { status: 'ACCEPTED', assetId: aid, finalPath: finalPath };
        }).catch(function(e) {
          // Repository failed — remove orphan file
          fileStore.cleanup(finalPath);
          return { status: 'ERROR', error: 'REPOSITORY_FAILED: ' + e.message };
        });
      } catch(e) { fileStore.cleanup(finalPath); return { status: 'ERROR', error: 'ASSET_CREATE_FAILED' }; }
    });
  }
  return { processUpload: processUpload };
}
module.exports = { createCustomLibraryService: createCustomLibraryService };
