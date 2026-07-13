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

    if (asset.libraryType !== libraryType) {
      throw new Error('Library type mismatch: expected ' + libraryType + ', got ' + asset.libraryType);
    }

    if (asset.safetyStatus !== 'SAFE') {
      throw new Error('Asset not safe: ' + asset.safetyStatus);
    }

    if (asset.lifecycleStatus !== 'SELECTABLE') {
      throw new Error('Asset not selectable: ' + asset.lifecycleStatus);
    }

    // localPath 必须可读
    if (!asset.localPath) throw new Error('Asset has no local path');
    var fs = require('fs');
    if (!fs.existsSync(asset.localPath)) {
      throw new Error('Asset local file not found: ' + asset.localPath);
    }

    return { asset: asset, assetId: assetId, libraryType: libraryType };
  }

  // FOCUS_LOCK: 解析 theme/albumId/libraryType,查询匹配资产
  // strict: 提供 theme/albumId 时必须匹配,否则 throw NO_MATCH(不回退)
  async function selectForFocusLock(options) {
    options = options || {};
    var libraryType = options.libraryType;
    var theme = options.theme;
    var albumId = options.albumId;

    if (!libraryType) throw new Error('libraryType required for focus lock');

    // 查询 libraryType 的所有 SAFE+SELECTABLE 资产
    var filter = { libraryType: libraryType, safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' };
    var assets = await assetRepository.list(filter);

    // 如果有 albumId,按 albumId 过滤
    if (albumId) {
      assets = assets.filter(function(a) {
        return a.metadata && a.metadata.albumId === albumId;
      });
      if (assets.length === 0) {
        throw new Error('NO_MATCH: no assets with albumId=' + albumId);
      }
    }

    // 如果有 theme,按 theme 过滤
    if (theme) {
      var themed = assets.filter(function(a) {
        return a.metadata && a.metadata.theme === theme;
      });
      if (themed.length === 0) {
        throw new Error('NO_MATCH: no assets with theme=' + theme);
      }
      assets = themed;
    }

    if (assets.length === 0) {
      throw new Error('NO_MATCH: no SAFE+SELECTABLE assets for libraryType=' + libraryType);
    }

    // 选择第一个(不回退到非 theme/album 匹配的资产)
    var selected = assets[0];

    // 验证 localPath 可读
    if (!selected.localPath) throw new Error('Selected asset has no local path');
    var fs = require('fs');
    if (!fs.existsSync(selected.localPath)) {
      throw new Error('Asset local file not found: ' + selected.localPath);
    }

    return { asset: selected, assetId: selected.assetId, libraryType: libraryType, theme: theme, albumId: albumId };
  }

  return {
    selectForOneShot: selectForOneShot,
    selectForFocusLock: selectForFocusLock,
  };
}

module.exports = { createAssetSelectionService: createAssetSelectionService };
