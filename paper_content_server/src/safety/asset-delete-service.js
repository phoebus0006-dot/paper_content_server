// asset-delete-service.js — Real unsafe asset deletion with explicit context and verified replacement
var path = require('path');
var fs = require('fs');
var { assertCanDelete } = require('./safety-decision');

function AssetDeleteService(assetRepository, referenceIndex, snapshotStore, snapshotCache,
  publicationHistory, tombstoneStore, auditLog, referenceCleaner, logger, findSafeReplacement, publishReplacement) {
  logger = logger || {};

  function deleteUnsafeAsset(opts) {
    var assetId = opts.assetId, reason = opts.reason, decision = opts.decision || 'remove', dryRun = opts.dryRun !== false;
    var state = { asset: null, references: null, auditId: Date.now().toString(36) };
    var context = { reason: reason, decision: decision };

    return assetRepository.get(assetId).then(function(asset) {
      if (!asset) throw new Error('Asset not found');
      if (asset.lifecycleStatus === 'TOMBSTONED' || asset.lifecycleStatus === 'DELETED')
        return { assetId: assetId, deleted: true, alreadyDeleted: true, complete: true };
      assertCanDelete(asset, reason); state.asset = asset;
      if (!dryRun) return assetRepository.markBlocked(assetId, reason);
    }).then(function(r) {
      if (r && r.alreadyDeleted) return r;
      return referenceIndex.findReferences(assetId);
    }).then(function(refs) {
      if (refs && refs.alreadyDeleted) return refs;
      state.references = refs;
      if (!refs.complete) throw new Error('Reference scan incomplete');
      var activeRefs = refs.references.filter(function(r) { return r.type === 'active_snapshot'; });
      state.replacementRequired = activeRefs.length > 0;
      if (dryRun) return buildDryRun(state);
      return executeDelete(state, context);
    }).then(function(result) {
      if (result && result.alreadyDeleted) return result;
      return auditLog.append({ assetId: assetId, action: dryRun ? 'dry-run' : 'delete', reason: reason,
        decision: decision, dryRun: dryRun, result: result }).then(function() { return result; });
    });
  }

  function buildDryRun(state) {
    var activeRefs = state.references.references.filter(function(r) { return r.type === 'active_snapshot'; });
    return { assetId: state.asset.assetId, wouldBlock: true, references: state.references.references,
      replacementRequired: activeRefs.length > 0, complete: state.references.complete, dryRun: true };
  }

  function executeDelete(state, context) {
    if (state.replacementRequired) {
      if (!findSafeReplacement || !publishReplacement) throw new Error('DELETE_BLOCKED_NO_SAFE_REPLACEMENT');
      return findSafeReplacement(state.asset).then(function(replacement) {
        if (!replacement) throw new Error('DELETE_BLOCKED_NO_SAFE_REPLACEMENT');
        return publishReplacement(replacement);
      }).then(function() {
        return snapshotStore.readActive();
      }).then(function(active) {
        if (!active) throw new Error('DELETE_BLOCKED_REPLACEMENT_FAILED');
        return snapshotStore.load(active.activeSnapshotId);
      }).then(function(snap) {
        if (snap && snap.payload) {
          var stillRef = ['assetId','photoId','imageId','legacyId','localPath'].some(function(k) { return snap.payload[k] === state.asset.assetId; });
          if (stillRef) throw new Error('DELETE_BLOCKED_REPLACEMENT_FAILED');
        }
        return referenceIndex.findReferences(state.asset.assetId);
      }).then(function(rescan) {
        var activeAfterRescan = rescan.references.filter(function(r) { return r.type === 'active_snapshot'; });
        if (activeAfterRescan.length > 0) throw new Error('DELETE_BLOCKED_REPLACEMENT_FAILED');
        state.replacementVerified = true;
        return doClean(state, context);
      });
    }
    return doClean(state, context);
  }

  function doClean(state, context) {
    var result = { assetId: state.asset.assetId, deleted: false, blocked: true, complete: false };
    if (state.replacementVerified) result.activeReplaced = true;
    // History invalidation
    var histPromises = state.references.references.filter(function(r) { return r.snapshotId; }).map(function(r) {
      if (publicationHistory) return publicationHistory.update(r.snapshotId, { restorable: false, invalidReason: 'UNSAFE_ASSET_DELETED', invalidatedAt: new Date().toISOString() });
    });
    return Promise.all(histPromises).then(function(hResults) {
      result.historyInvalidated = hResults.length > 0;
      var cc = referenceCleaner.cleanCache(state.asset.assetId);
      result.cacheCleaned = cc.cleaned;
      var ic = referenceCleaner.cleanLegacyIndexes(state.asset.assetId, state.references);
      result.legacyIndexCleaned = ic.legacyIndexCleaned; result.overrideCleaned = ic.overrideCleaned;
      if (state.asset.localPath) {
        try { fs.unlinkSync(state.asset.localPath); result.fileDeleted = true; } catch(e) { logger.error('file delete failed: ' + e.message); result.reason = 'FILE_DELETE_FAILED'; return result; }
      }
      return assetRepository.markTombstoned(state.asset.assetId, 'unsafe asset deleted').then(function() {
        return tombstoneStore.write({ assetId: state.asset.assetId, reason: context.reason, decision: context.decision,
          deletedAt: new Date().toISOString(), originalSha256: state.asset.sha256, sourceType: state.asset.sourceType,
          libraryType: state.asset.libraryType, referencesCleaned: state.references.references.length, auditId: state.auditId });
      }).then(function() { result.deleted = true; result.tombstoneWritten = true; result.complete = true; return result; });
    });
  }
  return { deleteUnsafeAsset: deleteUnsafeAsset };
}
module.exports = { AssetDeleteService: AssetDeleteService };