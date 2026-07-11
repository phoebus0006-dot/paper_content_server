// custom-library-service.js — Upload orchestration
var path = require('path');
function createCustomLibraryService(fileStore, validator, deduplicator, safetyGate, assetRepository, logger) {
  logger = logger || {};
  function processUpload(upload) {
    var validation = validator.validate(upload);
    if (!validation.ok) return Promise.resolve({ status: 'REJECTED', errors: validation.errors });
    var quarantinePath;
    try { quarantinePath = fileStore.storeQuarantine(upload.filePath); } catch(e) { return Promise.resolve({ status: 'ERROR', error: 'QUARANTINE_FAILED' }); }
    return deduplicator.isDuplicate(upload.sha256).then(function(dup) {
      if (dup) { fileStore.cleanup(quarantinePath); return { status: 'DUPLICATE', sha256: upload.sha256 }; }
      try {
        var am = require(path.join(__dirname, '..', 'assets', 'asset-model'));
        var asset = am.createAsset({ sourceUrl: null, localPath: quarantinePath, libraryType: 'CUSTOM', sourceType: 'upload', sha256: upload.sha256, mimeType: upload.mimeType, width: upload.width, height: upload.height, safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' });
        return assetRepository.create(asset).then(function(assetId) {
          var finalPath = fileStore.moveToAssets(quarantinePath, assetId);
          return { status: 'ACCEPTED', assetId: assetId, finalPath: finalPath };
        }).catch(function(e) { fileStore.cleanup(quarantinePath); return { status: 'ERROR', error: 'REPOSITORY_FAILED: ' + e.message }; });
      } catch(e) { fileStore.cleanup(quarantinePath); return { status: 'ERROR', error: 'ASSET_CREATE_FAILED' }; }
    });
  }
  return { processUpload: processUpload };
}
module.exports = { createCustomLibraryService: createCustomLibraryService };