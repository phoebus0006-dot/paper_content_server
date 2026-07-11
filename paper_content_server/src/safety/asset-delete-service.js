// asset-delete-service.js — Real unsafe asset deletion with safe replacement and idempotency
var path = require('path');
var fs = require('fs');
var { assertCanDelete } = require('./safety-decision');

function AssetDeleteService(assetRepository, referenceIndex, snapshotStore, snapshotCache,
  publicationHistory, tombstoneStore, auditLog, referenceCleaner, logger, findSafeReplacement, publishReplacement) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function deleteUnsafeAsset(opts) {
    var assetId = opts.assetId, reason = opts.reason, decision = opts.decision || 'remove', dryRun = opts.dryRun !== false;
    var state = { asset: null, references: null, auditId: Date.now().toString(36) };

    return assetRepository.get(assetId).then(function(asset) {
      if (!asset) throw new Error('Asset not found: ' + assetId);
      // Idempotent: already deleted/tombstoned is not an error
      if (asset.lifecycleStatus === 'TOMBSTONED' || asset.lifecycleStatus === 'DELETED') {
        return { assetId: assetId, deleted: true, alreadyDeleted: true, complete: true };
      }
      assertCanDelete(asset, reason); state.asset = asset;
      if (!dryRun) return assetRepository.markBlocked(assetId, reason);
    }).then(function(earlyResult) {
      if (earlyResult && earlyResult.alreadyDeleted) return earlyResult;
      return referenceIndex.findReferences(assetId);
    }).then(function(refs) {
      if (refs && refs.alreadyDeleted) return refs;
      state.references = refs;
      if (!refs.complete) throw new Error('Reference scan incomplete');
      var activeRef = refs.references.filter(function(r) { return r.type === 'active_snapshot'; });
      if (activeRef.length > 0) state.replacementRequired = true;
      if (dryRun) return buildDryRunResult(state);
      return executeDelete(state, opts);
    }).then(function(result) {
      if (result && result.alreadyDeleted) return result;
      return auditLog.append({ assetId: assetId, action: dryRun ? 'dry-run' : 'delete', reason: reason,
        decision: decision, dryRun: dryRun, result: result }).then(function() { return result; });
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
    // Safe replacement for active target
    if (state.replacementRequired) {
      if (!findSafeReplacement || !publishReplacement) throw new Error('DELETE_BLOCKED_NO_SAFE_REPLACEMENT');
      return findSafeReplacement(state.asset).then(function(replacement) {
        if (!replacement) throw new Error('DELETE_BLOCKED_NO_SAFE_REPLACEMENT: no safe replacement found');
        return publishReplacement(replacement);
      }).then(function() {
        return snapshotStore.readActive().then(function(active) {
          if (!active) throw new Error('DELETE_BLOCKED_REPLACEMENT_FAILED: no active snapshot after replacement');
          return snapshotStore.load(active.activeSnapshotId);
        });
      }).then(function(activeSnap) {
        // Verify active no longer references target
        if (activeSnap && activeSnap.payload) {
          var targetKeys = ['assetId','photoId','imageId','legacyId','localPath'];
          var stillReferenced = targetKeys.some(function(k) { return activeSnap.payload[k] === state.asset.assetId; });
          if (stillReferenced) throw new Error('DELETE_BLOCKED_REPLACEMENT_FAILED: active still references target');
        }
        // Re-run complete reference scan
        return referenceIndex.findReferences(state.asset.assetId);
      }).then(function(rescan) {
        if (!rescan.complete) throw new Error('DELETE_BLOCKED_REPLACEMENT_FAILED: rescan incomplete');
        result.activeReplaced = true;
        return doCleanup(state, result, opts);
      });
    }
    return doCleanup(state, result, opts);
  }

  function doCleanup(state, result, opts) {
    // Mark history non-restorable
    var histPromises = state.references.references.filter(function(r) { return r.type === 'publication_history' || r.type === 'active_snapshot'; }).map(function(r) {
      if (r.snapshotId && publicationHistory) {
        return publicationHistory.update(r.snapshotId, { restorable: false, invalidReason: 'UNSAFE_ASSET_DELETED', invalidatedAt: new Date().toISOString() }).catch(function(e) { logger.warn('history update failed: ' + e.message); });
      }
    });
    return Promise.all(histPromises).then(function() {
      result.historyInvalidated = true;
      // Clean cache
      if (snapshotCache) { var cacheClean = referenceCleaner.cleanCache(state.asset.assetId); result.cacheCleaned = cacheClean.cleaned; }
      // Clean legacy indexes
      var indexResults = referenceCleaner.cleanLegacyIndexes(state.asset.assetId, state.references);
      result.overrideCleaned = indexResults.overrideCleaned;
      result.legacyIndexCleaned = indexResults.legacyIndexCleaned;
      // Delete file
      result.fileDeleted = false;
      if (state.asset.localPath) {
        try { fs.unlinkSync(state.asset.localPath); result.fileDeleted = true; } catch(e) {
          logger.error('file delete failed: ' + state.asset.assetId + ' — ' + e.message);
          result.reason = 'FILE_DELETE_FAILED'; return result; // stays BLOCKED
        }
      }
      // Mark TOMBSTONED
      return assetRepository.markTombstoned(state.asset.assetId, 'unsafe asset deleted').then(function() {
        return tombstoneStore.write({ assetId: state.asset.assetId, reason: opts.reason, decision: opts.decision,
          deletedAt: new Date().toISOString(), originalSha256: state.asset.sha256,
          sourceType: state.asset.sourceType, libraryType: state.asset.libraryType,
          referencesCleaned: state.references.references.length, auditId: state.auditId });
      }).then(function() {
        result.deleted = true; result.tombstoneWritten = true; result.complete = true;
        logger.info('Asset deleted: ' + state.asset.assetId); return result;
      });
    });
  }

  return { deleteUnsafeAsset: deleteUnsafeAsset };
}
module.exports = { AssetDeleteService: AssetDeleteService };