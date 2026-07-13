// override-persistence.js — 持久化 ONE_SHOT/FOCUS_LOCK override 状态
var fs = require('fs');
var path = require('path');

function createOverridePersistence(stateFile, logger) {
  logger = logger || {};

  function saveOverride(state) {
    // state: { mode, assetId, snapshotId, libraryType, theme?, albumId?, savedAt }
    var data = JSON.stringify(state, null, 2);
    fs.writeFileSync(stateFile, data);
    logger.info && logger.info('Override saved: ' + state.mode + ' asset=' + state.assetId);
  }

  function loadOverride() {
    try {
      if (!fs.existsSync(stateFile)) return null;
      var data = fs.readFileSync(stateFile, 'utf8');
      return JSON.parse(data);
    } catch(e) {
      logger.warn && logger.warn('Failed to load override: ' + e.message);
      return null;
    }
  }

  function clearOverride() {
    try {
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }
    } catch(e) {
      logger.warn && logger.warn('Failed to clear override: ' + e.message);
    }
  }

  // async 验证:资产仍安全、可选、文件存在
  async function validateOverrideAsync(state, assetRepository) {
    if (!state || !state.assetId) return { valid: false, reason: 'NO_ASSET_ID' };

    var asset = await assetRepository.get(state.assetId);
    if (!asset) return { valid: false, reason: 'ASSET_NOT_FOUND' };

    if (asset.safetyStatus !== 'SAFE') {
      return { valid: false, reason: 'ASSET_NOT_SAFE', current: asset.safetyStatus };
    }

    if (asset.lifecycleStatus !== 'SELECTABLE') {
      return { valid: false, reason: 'ASSET_NOT_SELECTABLE', current: asset.lifecycleStatus };
    }

    if (!asset.localPath) {
      return { valid: false, reason: 'NO_LOCAL_PATH' };
    }

    if (!fs.existsSync(asset.localPath)) {
      return { valid: false, reason: 'LOCAL_FILE_MISSING', path: asset.localPath };
    }

    if (state.libraryType && asset.libraryType !== state.libraryType) {
      return { valid: false, reason: 'LIBRARY_TYPE_MISMATCH', expected: state.libraryType, actual: asset.libraryType };
    }

    return { valid: true, asset: asset };
  }

  return {
    saveOverride: saveOverride,
    loadOverride: loadOverride,
    clearOverride: clearOverride,
    validateOverrideAsync: validateOverrideAsync,
  };
}

module.exports = { createOverridePersistence: createOverridePersistence };
