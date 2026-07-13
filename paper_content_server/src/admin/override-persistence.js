// override-persistence.js — 持久化 ONE_SHOT/FOCUS_LOCK override 状态
var fs = require('fs');
var path = require('path');

// Schema version for the persisted override envelope.
// Bumped when the on-disk shape changes; mismatches trigger quarantine.
var SCHEMA_VERSION = 1;

function createOverridePersistence(stateFile, logger) {
  logger = logger || {};

  // Move a corrupt/unreadable state file aside so we do not silently
  // re-read the same broken state on every restart. The original path
  // is freed (loadOverride will return null -> override cleared).
  function quarantineCorruptFile(reason) {
    try {
      var corruptPath = stateFile + '.corrupt.' + Date.now();
      fs.renameSync(stateFile, corruptPath);
      logger.warn && logger.warn('Override file quarantined to ' + corruptPath +
        (reason ? ' (' + reason + ')' : ''));
    } catch (e) {
      logger.warn && logger.warn('Failed to quarantine corrupt override file: ' + e.message);
    }
  }

  function saveOverride(state) {
    // state: { mode, assetId, snapshotId, libraryType, theme?, albumId?, savedAt }
    // Collision-safe atomic write:
    //   1. Unique tmp filename (pid + ts + random) — concurrent saveOverride()
    //      calls (e.g. multi-process) never share a tmp path.
    //   2. openSync('wx') = O_CREAT|O_EXCL — fails if the tmp path already
    //      exists, guaranteeing we own it.
    //   3. fsync the file before rename so bytes are durable.
    //   4. rename tmp → state (atomic on POSIX; on Windows atomic when target
    //      is replaced via MoveFileEx, which Node uses).
    //   5. Best-effort fsync of the parent directory so the rename entry
    //      itself is durable. Some platforms do not support directory fsync —
    //      silently ignore.
    //   6. On any failure, unlink our tmp file so we never leak tmp litter.
    var envelope = Object.assign({}, state, { schemaVersion: SCHEMA_VERSION });
    var data = JSON.stringify(envelope, null, 2);
    var tmpPath = stateFile + '.tmp.' + process.pid + '.' + Date.now() + '.' +
      Math.random().toString(36).slice(2, 8);
    var fd = -1;
    try {
      fd = fs.openSync(tmpPath, 'wx'); // exclusive create
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = -1;
      fs.renameSync(tmpPath, stateFile);
      try {
        var dirFd = fs.openSync(path.dirname(stateFile), 'r');
        fs.fsyncSync(dirFd);
        fs.closeSync(dirFd);
      } catch (_) {} // directory fsync unsupported on some systems — ignore
    } catch (e) {
      if (fd !== -1) {
        try { fs.closeSync(fd); } catch (closeErr) {
          logger.warn && logger.warn('Failed to close tmp fd after error: ' + closeErr.message);
        }
      }
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      throw e;
    }
    logger.info && logger.info('Override saved: ' + state.mode + ' asset=' + state.assetId);
  }

  function loadOverride() {
    if (!fs.existsSync(stateFile)) return null;
    var data;
    try {
      data = fs.readFileSync(stateFile, 'utf8');
    } catch (e) {
      logger.warn && logger.warn('Failed to read override file (quarantining): ' + e.message);
      quarantineCorruptFile('READ_ERROR');
      return null;
    }
    var parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      logger.warn && logger.warn('Failed to parse override JSON (quarantining): ' + e.message);
      quarantineCorruptFile('PARSE_ERROR');
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== SCHEMA_VERSION) {
      logger.warn && logger.warn('Override schemaVersion mismatch or invalid (quarantining): expected=' + SCHEMA_VERSION);
      quarantineCorruptFile('SCHEMA_VERSION_MISMATCH');
      return null;
    }
    return parsed;
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
    SCHEMA_VERSION: SCHEMA_VERSION,
  };
}

module.exports = {
  createOverridePersistence: createOverridePersistence,
  SCHEMA_VERSION: SCHEMA_VERSION,
};
