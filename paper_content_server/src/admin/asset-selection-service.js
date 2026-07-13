// asset-selection-service.js — 真实资产选择服务
// 用于 ONE_SHOT 和 FOCUS_LOCK 的显式资产选择

function createAssetSelectionService(assetRepository, snapshotStore, logger) {
  logger = logger || {};

  // ONE_SHOT: 解析 libraryType + assetId,验证资产,生成 snapshot
  async function selectForOneShot(libraryType, assetId) {
    if (!assetId) throw new Error('assetId required');
    if (!libraryType) throw new Error('libraryType required');

    var asset = await assetRepository.get(assetId);
    if (!asset) throw new Error('Asset not found: ' + assetId);

    // 验证 libraryType
    if (asset.libraryType !== libraryType) {
      throw new Error('Library type mismatch: expected ' + libraryType + ', got ' + asset.libraryType);
    }

    // 验证 safety
    if (asset.safetyStatus !== 'SAFE') {
      throw new Error('Asset not safe: ' + asset.safetyStatus);
    }

    // 验证 lifecycle
    if (asset.lifecycleStatus !== 'SELECTABLE') {
      throw new Error('Asset not selectable: ' + asset.lifecycleStatus);
    }

    // 验证 local file 可读
    if (!asset.localPath) {
      throw new Error('Asset has no local path');
    }
    var fs = require('fs');
    if (!fs.existsSync(asset.localPath)) {
      throw new Error('Asset local file not found: ' + asset.localPath);
    }

    return { asset: asset, assetId: assetId, libraryType: libraryType };
  }

  // FOCUS_LOCK: 解析 theme/albumId/libraryType,查询匹配资产
  async function selectForFocusLock(options) {
    options = options || {};
    var libraryType = options.libraryType;
    var theme = options.theme;
    var albumId = options.albumId;

    if (!libraryType) throw new Error('libraryType required for focus lock');

    var filter = { libraryType: libraryType, safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' };
    if (albumId) filter.albumId = albumId;

    var assets = await assetRepository.list(filter);

    if (assets.length === 0) {
      throw new Error('No matching assets found for libraryType=' + libraryType +
        (theme ? ' theme=' + theme : '') + (albumId ? ' albumId=' + albumId : ''));
    }

    // 如果有 theme,按 metadata.theme 过滤(简化)
    var selected = assets[0];
    if (theme) {
      var themed = assets.filter(function(a) {
        return a.metadata && a.metadata.theme === theme;
      });
      if (themed.length > 0) selected = themed[0];
    }

    // 验证 local file
    if (!selected.localPath) throw new Error('Selected asset has no local path');
    var fs = require('fs');
    if (!fs.existsSync(selected.localPath)) {
      throw new Error('Asset local file not found: ' + selected.localPath);
    }

    return { asset: selected, assetId: selected.assetId, libraryType: libraryType };
  }

  return {
    selectForOneShot: selectForOneShot,
    selectForFocusLock: selectForFocusLock,
  };
}

module.exports = { createAssetSelectionService: createAssetSelectionService };
