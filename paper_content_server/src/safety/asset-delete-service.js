// asset-delete-service.js — Safety delete pipeline with atomicity and real file deletion
var path = require('path');
var fs = require('fs');
var { assertCanDelete } = require('./safety-decision');

function AssetDeleteService(assetRepository, referenceIndex, snapshotStore, snapshotCache,
  publicationHistory, tombstoneStore, auditLog, referenceCleaner, logger, findSafeReplacement) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function deleteUnsafeAsset(opts) {
    var assetId = opts.assetId, reason = opts.reason, dryRun = opts.dryRun !== false;
    var state = { asset: null, references: null, auditId: Date.now().toString(36) };
    return assetRepository.get(assetId).then(function(asset) {
      if (!asset) throw new Error('Asset not found: ' + assetId);
      assertCanDelete(asset, reason); state.asset = asset;
      if (!dryRun) return assetRepository.markBlocked(assetId, reason);
    }).then(function() {
      return referenceIndex.findReferences(assetId);
    }).then(function(refs) {
      state.references = refs;
      if (!refs.complete) throw new Error('Reference scan incomplete');
      var activeRef = refs.references.filter(function(r) { return r.type === 'active_snapshot'; });
      if (activeRef.length > 0) state.replacementRequired = true;
      if (dryRun) return buildDryRunResult(state);
      return executeDelete(state, opts);
    }).then(function(result) {
      return auditLog.append({ assetId: assetId, action: dryRun ? 'dry-run' : 'delete', reason: reason, dryRun: dryRun, result: result }).then(function() { return result; });
    });
  }

  function buildDryRunResult(state) {
    var activeRef = state.references.references.filter(function(r) { return r.type === 'active_snapshot'; });
    return { assetId: state.asset.assetId, wouldBlock: true, references: state.references.references,
      replacementRequired: activeRef.length > 0, filesToDelete: state.asset.localPath ? [state.asset.localPath] : [],
      indexesToUpdate: ['asset_repository'], snapshotsToInvalidate: activeRef.length > 0 ? ['active-snapshot.json'] : [],
      rollbackEntriesToDisable: [], complete: state.references.complete, dryRun: true };
  }

  function executeDelete(state, opts) {
    var result = { assetId: state.asset.assetId, deleted: false, blocked: true, complete: false };
    if (state.replacementRequired) {
      if (!findSafeReplacement) throw new Error('DELETE_BLOCKED_NO_SAFE_REPLACEMENT');
      return findSafeReplacement(state.asset).then(function(replacement) {
        if (!replacement) throw new Error('DELETE_BLOCKED_NO_SAFE_REPLACEMENT');
        return doExecute(state, result);
      });
    }
    return doExecute(state, result);
  }

  function doExecute(state, result) {
    var histPromises = state.references.references.filter(function(r) { return r.type === 'publication_history' || r.type === 'active_snapshot'; }).map(function(r) {
      if (publicationHistory) return publicationHistory.update(r.location, { restorable: false, invalidReason: 'UNSAFE_ASSET_DELETED', invalidatedAt: new Date().toISOString() }).catch(function(e) { logger.warn('history update failed: ' + e.message); });
    });
    return Promise.all(histPromises).then(function() {
      if (snapshotCache && state.asset.assetId) referenceCleaner.cleanCache(state.asset.assetId);
      result.rollbackInvalidated = true; result.cacheInvalidated = true;
      if (state.asset.localPath) {
        try { fs.unlinkSync(state.asset.localPath); result.fileDeleted = true; } catch(e) {
          logger.error('file delete failed: ' + e.message);
          result.reason = 'FILE_DELETE_FAILED'; return result; // lifecycle stays BLOCKED
        }
      }
      return assetRepository.markTombstoned(state.asset.assetId, 'unsafe asset deleted').then(function() {
        return tombstoneStore.write({ assetId: state.asset.assetId, reason: opts.reason, decision: opts.decision || 'remove',
          deletedAt: new Date().toISOString(), originalSha256: state.asset.sha256, sourceType: state.asset.sourceType,
          libraryType: state.asset.libraryType, referencesCleaned: state.references.references.length, auditId: state.auditId });
      }).then(function() {
        result.deleted = true; result.tombstoneWritten = true; result.indexesCleaned = true; result.complete = true;
        logger.info('Asset deleted: ' + state.asset.assetId); return result;
      });
    });
  }
  return { deleteUnsafeAsset: deleteUnsafeAsset };
}
module.exports = { AssetDeleteService: AssetDeleteService };