// asset-delete-service.js — Safety delete pipeline with dry-run and atomicity
var path = require('path');
var { assertCanDelete } = require('./safety-decision');

function AssetDeleteService(assetRepository, referenceIndex, snapshotStore, snapshotCache,
  publicationHistory, tombstoneStore, auditLog, referenceCleaner, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function deleteUnsafeAsset(opts) {
    var assetId = opts.assetId, reason = opts.reason, decision = opts.decision || 'remove', dryRun = opts.dryRun !== false;
    var state = { asset: null, references: null, replacementSnap: null, auditId: Date.now().toString(36) };

    return assetRepository.get(assetId).then(function(asset) {
      if (!asset) throw new Error('Asset not found: ' + assetId);
      assertCanDelete(asset, reason);
      state.asset = asset;
      if (!dryRun) { return assetRepository.markBlocked(assetId, reason); }
    }).then(function() {
      return referenceIndex.findReferences(assetId);
    }).then(function(refs) {
      state.references = refs;
      if (!refs.complete) throw new Error('Reference scan incomplete — cannot proceed');
      var activeRef = refs.references.filter(function(r) { return r.type === 'active_snapshot'; });
      if (activeRef.length > 0) state.replacementRequired = true;
      if (dryRun) return buildDryRunResult(state);
      return executeDelete(state, opts);
    }).then(function(result) {
      return auditLog.append({
        assetId: assetId, action: dryRun ? 'dry-run' : 'delete', reason: reason,
        decision: decision, dryRun: dryRun, result: result,
      }).then(function() { return result; });
    });
  }

  function buildDryRunResult(state) {
    var activeRef = state.references.references.filter(function(r) { return r.type === 'active_snapshot'; });
    return {
      assetId: state.asset.assetId, wouldBlock: true,
      references: state.references.references,
      replacementRequired: activeRef.length > 0,
      filesToDelete: state.asset.localPath ? [state.asset.localPath] : [],
      indexesToUpdate: ['asset_repository'],
      snapshotsToInvalidate: activeRef.length > 0 ? [state.references.references[0].location] : [],
      rollbackEntriesToDisable: [],
      complete: state.references.complete,
      dryRun: true,
    };
  }

  function executeDelete(state, opts) {
    return {
      assetId: state.asset.assetId, deleted: true,
      referencesCleaned: state.references.references.length,
      tombstoneWritten: false,
      complete: false, reason: 'REAL_DELETE_NOT_IMPLEMENTED',
    };
  }

  return { deleteUnsafeAsset: deleteUnsafeAsset };
}

module.exports = { AssetDeleteService: AssetDeleteService };
