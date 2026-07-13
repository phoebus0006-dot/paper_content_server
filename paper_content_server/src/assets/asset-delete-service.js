// asset-delete-service.js — Atomic delete pipeline
// Lifecycle order: markBlocked -> tombstone -> cleanup -> audit -> markTombstoned
// Fail-closed: every step rejects on failure (no swallow); subsequent steps do not run.

var safetyDecision = require('../safety/safety-decision');
var canDelete = safetyDecision.canDelete;

var VALID_REASONS = ['UNSAFE', 'SUSPICIOUS', 'POLICY_BLOCKED'];

function createAssetDeleteService(assetRepository, referenceIndex, tombstoneStore, auditLog, referenceCleaner, logger, options) {
  logger = logger || {};
  options = options || {};
  var enabled = options.enabled !== false; // default true; set { enabled: false } to disable

  async function deleteAsset(assetId, reason) {
    // 0. Feature flag guard
    if (!enabled) {
      throw new Error('FEATURE_DISABLED');
    }

    // 1. Reason enum validation
    if (VALID_REASONS.indexOf(reason) < 0) {
      throw new Error('INVALID_REASON: must be one of ' + VALID_REASONS.join(','));
    }

    // 2. Get asset
    var asset = await assetRepository.get(assetId);
    if (!asset) throw new Error('Asset not found: ' + assetId);

    // 3. Safety decision check
    if (!canDelete(asset, reason)) {
      throw new Error('Cannot delete asset ' + assetId + ': reason=' + reason +
        ' safety=' + asset.safetyStatus + ' lifecycle=' + asset.lifecycleStatus);
    }

    // 4. Reference check — ensure asset is not referenced anywhere
    if (referenceIndex) {
      var refs = await referenceIndex.findReferences(assetId);
      if (refs && refs.references && refs.references.length > 0) {
        throw new Error('Asset ' + assetId + ' has ' + refs.references.length + ' active references');
      }
    }

    // 5. markBlocked(reason) — transition to BLOCKED first (never go directly to TOMBSTONED)
    //    Idempotent: if already BLOCKED (retry case), skip to avoid forbidden BLOCKED->BLOCKED.
    if (asset.lifecycleStatus !== 'BLOCKED') {
      try {
        await assetRepository.markBlocked(assetId, reason);
      } catch (e) {
        throw new Error('MARK_BLOCKED_FAILED: ' + e.message);
      }
    }

    // 6. Write tombstone (idempotent: store overwrites by assetId)
    if (tombstoneStore) {
      try {
        await tombstoneStore.write({
          assetId: assetId,
          reason: reason,
          deletedAt: new Date().toISOString(),
        });
      } catch (e) {
        // Asset is now BLOCKED; retry will re-write tombstone (idempotent).
        throw new Error('TOMBSTONE_WRITE_FAILED: ' + e.message);
      }
    }

    // 7. Clean references / cache (retryable on failure)
    if (referenceCleaner) {
      try {
        await referenceCleaner.cleanCache(assetId);
      } catch (e) {
        // Asset is BLOCKED + tombstone written; retry cleanup.
        throw new Error('CLEANUP_FAILED: ' + e.message);
      }
    }

    // 8. Audit log (append may repeat on retry — acceptable for append-only log)
    if (auditLog) {
      try {
        await auditLog.append({
          action: 'DELETE',
          assetId: assetId,
          reason: reason,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        throw new Error('AUDIT_FAILED: ' + e.message);
      }
    }

    // 9. markTombstoned — final step: BLOCKED -> TOMBSTONED
    try {
      await assetRepository.markTombstoned(assetId, reason);
    } catch (e) {
      throw new Error('MARK_TOMBSTONED_FAILED: ' + e.message);
    }

    logger.info && logger.info('Asset deleted: ' + assetId + ' reason=' + reason);
    return { assetId: assetId, reason: reason, status: 'TOMBSTONED' };
  }

  return { deleteAsset: deleteAsset };
}

module.exports = {
  createAssetDeleteService: createAssetDeleteService,
  VALID_REASONS: VALID_REASONS,
};
