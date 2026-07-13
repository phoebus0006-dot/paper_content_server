// asset-delete-service.js — 完整删除管道
// reference check → tombstone → cache/reference cleanup → audit log → file cleanup

function createAssetDeleteService(assetRepository, referenceIndex, tombstoneStore, auditLog, referenceCleaner, logger) {
  logger = logger || {};

  async function deleteAsset(assetId, reason) {
    // 1. Get asset
    var asset = await assetRepository.get(assetId);
    if (!asset) throw new Error('Asset not found: ' + assetId);

    // 2. Safety decision check
    var { canDelete } = require('../safety/safety-decision');
    if (!canDelete(asset, reason)) {
      throw new Error('Cannot delete asset ' + assetId + ': reason=' + reason +
        ' safety=' + asset.safetyStatus + ' lifecycle=' + asset.lifecycleStatus);
    }

    // 3. Reference check — 确保资产没有被引用
    if (referenceIndex) {
      var refs = await referenceIndex.getReferences(assetId);
      if (refs && refs.length > 0) {
        throw new Error('Asset ' + assetId + ' has ' + refs.length + ' active references');
      }
    }

    // 4. Tombstone
    if (tombstoneStore) {
      await tombstoneStore.record(assetId, { reason: reason, deletedAt: new Date().toISOString() });
    }

    // 5. Mark as TOMBSTONED in repository
    await assetRepository.markTombstoned(assetId, reason);

    // 6. Clean up references
    if (referenceCleaner) {
      await referenceCleaner.cleanForAsset(assetId);
    }

    // 7. Audit log
    if (auditLog) {
      await auditLog.record({
        action: 'DELETE',
        assetId: assetId,
        reason: reason,
        timestamp: new Date().toISOString(),
      });
    }

    // 8. File cleanup (保留文件或删除,由配置决定)
    // 当前策略:保留文件,只标记 TOMBSTONED

    logger.info && logger.info('Asset deleted: ' + assetId + ' reason=' + reason);
    return { assetId: assetId, reason: reason, status: 'DELETED' };
  }

  return { deleteAsset: deleteAsset };
}

module.exports = { createAssetDeleteService: createAssetDeleteService };
