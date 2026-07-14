// custom-library-service.js — Upload with real decode, safety gate, final path atomicity
var path = require('path');

function createCustomLibraryService(fileStore, validator, deduplicator, safetyGate, assetRepository, logger) {
  logger = logger || {};

  async function processUpload(upload) {
    // 1. Validate metadata
    var v = validator.validate(upload);
    if (!v.ok) return { status: 'REJECTED', errors: v.errors };
    // 2. Quarantine
    var quarantinePath, decoded;
    try { quarantinePath = fileStore.storeQuarantine(upload.filePath); } catch(e) { return { status: 'ERROR', error: 'QUARANTINE_FAILED' }; }
    // 3. Real decode
    try { decoded = await fileStore.decodeAndRecompute(quarantinePath); } catch(e) { fileStore.cleanup(quarantinePath); return { status: 'ERROR', error: 'DECODE_FAILED' }; }
    // 4. Safety gate — required
    if (!safetyGate) { fileStore.cleanup(quarantinePath); return { status: 'ERROR', error: 'DEPENDENCY_UNAVAILABLE', reason: 'SAFETY_GATE_MISSING' }; }
    if (!safetyGate.isSafe(quarantinePath)) { fileStore.cleanup(quarantinePath); return { status: 'REJECTED', reason: 'SAFETY' }; }
    // 5. Duplicate check
    var dup = await deduplicator.isDuplicate(decoded.sha256);
    if (dup) { fileStore.cleanup(quarantinePath); return { status: 'DUPLICATE', sha256: decoded.sha256 }; }
    // 6. Generate assetId, move to final path
    var am = require(path.join(__dirname, '..', 'assets', 'asset-model'));
    var tempAsset = am.createAsset({ sourceUrl: null, localPath: '/tmp', libraryType: 'CUSTOM',
      safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' });
    var assetId = tempAsset.assetId;
    var finalPath;
    try { finalPath = fileStore.moveToAssets(quarantinePath, assetId); } catch(e) { fileStore.cleanup(quarantinePath); return { status: 'ERROR', error: 'MOVE_FAILED' }; }
    // 7. Create asset referencing final path using decoded metadata
    if (!assetRepository) {
      fileStore.cleanup(finalPath);
      return { status: 'ERROR', error: 'DEPENDENCY_UNAVAILABLE', reason: 'ASSET_REPOSITORY_MISSING' };
    }
    try {
      var asset = am.createAsset({
        assetId: assetId, sourceUrl: null, localPath: finalPath,
        libraryType: 'CUSTOM', sourceType: 'upload',
        sha256: decoded.sha256, mimeType: decoded.mimeType,
        width: decoded.width, height: decoded.height,
        safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
      });
      try {
        var aid = await assetRepository.create(asset);
        return { status: 'ACCEPTED', assetId: aid, finalPath: finalPath };
      } catch(e) {
        fileStore.cleanup(finalPath);
        return { status: 'ERROR', error: 'REPOSITORY_FAILED: ' + e.message };
      }
    } catch(e) { fileStore.cleanup(finalPath); return { status: 'ERROR', error: 'ASSET_CREATE_FAILED' }; }
  }
  return { processUpload: processUpload };
}
module.exports = { createCustomLibraryService: createCustomLibraryService };
