// asset-delete-service.js — Fail-closed with per-step cleanup verification
var path = require('path');
var fs = require('fs');
var { assertCanDelete } = require('./safety-decision');

function AssetDeleteService(assetRepository, referenceIndex, snapshotStore, snapshotCache,
  publicationHistory, tombstoneStore, auditLog, referenceCleaner, logger, findSafeReplacement, publishReplacement) {
  logger = logger || {};

  function deleteUnsafeAsset(opts) {
    var assetId = opts.assetId, reason = opts.reason, decision = opts.decision || 'remove', dryRun = opts.dryRun !== false;
    var state = { asset: null, refs: null, auditId: Date.now().toString(36) }, ctx = { reason: reason, decision: decision };

    return assetRepository.get(assetId).then(function(asset) {
      if (!asset) return fail('NOT_FOUND', 'INIT');
      if (asset.lifecycleStatus === 'TOMBSTONED' || asset.lifecycleStatus === 'DELETED')
        return { assetId: assetId, deleted: true, alreadyDeleted: true, complete: true };
      assertCanDelete(asset, reason); state.asset = asset;
      if (!dryRun) return assetRepository.markBlocked(assetId, reason);
    }).then(function(r) {
      if (r && r.alreadyDeleted) return r;
      return referenceIndex.findReferences(assetId);
    }).then(function(refs) {
      if (refs && refs.alreadyDeleted) return refs;
      state.refs = refs;
      if (!refs.complete) throw new Error('REFERENCE_SCAN_INCOMPLETE');
      if (refs.references.filter(function(r){return r.type==='active_snapshot';}).length > 0) state.needsReplacement = true;
      if (dryRun) return { assetId: assetId, wouldBlock: true, replacementRequired: state.needsReplacement || false, references: refs.references, complete: true, dryRun: true };
      return execDelete(state, ctx);
    }).then(function(result) {
      if (result && result.alreadyDeleted) return result;
      var status = result && result.complete ? 'SUCCESS' : 'FAILED';
      return auditLog.append({ assetId: assetId, action: 'delete', status: status, stage: result.stage || 'UNKNOWN', reason: reason, decision: decision, dryRun: dryRun, result: result }).then(function() { return result; });
    });
  }

  function fail(msg, stage) { return { deleted: false, complete: false, stage: stage, reason: msg }; }

  function execDelete(state, ctx) {
    return handleReplacement(state).then(function(r) { if (!r) return doClean(state, ctx); return r; });
  }

  function handleReplacement(state) {
    if (!state.needsReplacement) return Promise.resolve(null);
    if (!findSafeReplacement || !publishReplacement) return Promise.resolve(fail('NO_REPLACEMENT_PROVIDER', 'REPLACEMENT'));
    return findSafeReplacement(state.asset).then(function(r) {
      if (!r) return fail('NO_SAFE_REPLACEMENT', 'REPLACEMENT');
      return publishReplacement(r);
    }).then(function() { return snapshotStore.readActive(); }).then(function(a) {
      if (!a) return fail('REPLACEMENT_FAILED', 'REPLACEMENT_VERIFY');
      return snapshotStore.load(a.activeSnapshotId);
    }).then(function(s) {
      if (s && s.payload && ['assetId','photoId','imageId','legacyId','localPath'].some(function(k){return s.payload[k]===state.asset.assetId;}))
        return fail('REPLACEMENT_STILL_REFERENCES', 'REPLACEMENT_VERIFY');
      return referenceIndex.findReferences(state.asset.assetId);
    }).then(function(rs) {
      if (rs.references.filter(function(r){return r.type==='active_snapshot';}).length > 0) return fail('ACTIVE_REF_REMAINS', 'REPLACEMENT_RESCAN');
      state.replaced = true; return null;
    });
  }

  function doClean(state, ctx) {
    var result = { assetId: state.asset.assetId, deleted: false, blocked: true, complete: false };
    if (state.replaced) result.activeReplaced = true;

    // History invalidation — only publication_history and active_snapshot types
    var histSnapshotIds = {};
    state.refs.references.forEach(function(r) {
      if ((r.type === 'publication_history' || r.type === 'active_snapshot') && r.snapshotId && !histSnapshotIds[r.snapshotId]) {
        histSnapshotIds[r.snapshotId] = true;
      }
    });
    var histKeys = Object.keys(histSnapshotIds);
    var histPromises = histKeys.map(function(sid) {
      if (publicationHistory) return publicationHistory.update(sid, { restorable: false, invalidReason: 'UNSAFE_ASSET_DELETED', invalidatedAt: new Date().toISOString() }).catch(function(e) { result.histErrors = result.histErrors || []; result.histErrors.push(sid + ':' + e.message); });
    });

    return Promise.all(histPromises).then(function() {
      if (result.histErrors) return fail('HISTORY_INVALIDATION_FAILED', 'CLEANUP');
      result.historyInvalidated = true;

      // Cache
      var cc = referenceCleaner.cleanCache(state.asset.assetId);
      if (!cc.complete) return fail('CACHE_CLEANUP_FAILED', 'CLEANUP');
      result.cacheCleaned = cc.changed;

      // Indexes
      var ic = referenceCleaner.cleanLegacyIndexes(state.asset.assetId, state.refs);
      if (!ic.complete) return fail('INDEX_CLEANUP_FAILED', 'CLEANUP');
      result.legacyIndexCleaned = true;

      // Path safety before unlink
      if (!referenceCleaner.isPathAllowed(state.asset.localPath)) return fail('PATH_NOT_ALLOWED', 'PATH_SAFETY');

      // Unlink
      if (state.asset.localPath) {
        try { fs.unlinkSync(state.asset.localPath); result.fileDeleted = true; } catch(e) { return fail('FILE_DELETE:' + e.message, 'UNLINK'); }
      }

      // Tombstone
      return assetRepository.markTombstoned(state.asset.assetId, 'unsafe asset deleted').then(function() {
        return tombstoneStore.write({ assetId: state.asset.assetId, reason: ctx.reason, decision: ctx.decision,
          deletedAt: new Date().toISOString(), originalSha256: state.asset.sha256,
          sourceType: state.asset.sourceType, libraryType: state.asset.libraryType,
          referencesCleaned: state.refs.references.length, auditId: state.auditId });
      }).then(function() { result.deleted = true; result.tombstoneWritten = true; result.complete = true; return result; });
    });
  }

  return { deleteUnsafeAsset: deleteUnsafeAsset };
}
module.exports = { AssetDeleteService: AssetDeleteService };
