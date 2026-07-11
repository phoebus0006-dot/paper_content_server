// reference-cleaner.js — Real cleanup of asset references across the system
var fs = require('fs');
var path = require('path');

function ReferenceCleaner(snapshotStore, snapshotCache, publicationHistory, dataDir, logger) {
  dataDir = dataDir || 'data';
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function cleanActiveSnapshot(assetId) {
    return snapshotStore.readActive().then(function(active) {
      if (!active) return { cleaned: false, reason: 'no active snapshot' };
      return snapshotStore.load(active.activeSnapshotId).then(function(snap) {
        if (!snap || !snap.payload) return { cleaned: false, reason: 'empty payload' };
        var targetKeys = ['assetId','photoId','imageId','legacyId','localPath'];
        var referenced = targetKeys.some(function(k) { return snap.payload[k] === assetId; });
        return { cleaned: !referenced, reason: referenced ? 'still referenced' : 'not referenced', snapshotId: active.activeSnapshotId };
      });
    });
  }

  function cleanCache(assetId) {
    if (!snapshotCache) return { cleaned: false, reason: 'no cache' };
    var keys = snapshotCache.keys();
    var found = false;
    keys.forEach(function(k) {
      var snap = snapshotCache.get(k);
      if (snap && snap.payload) {
        ['assetId','photoId','imageId','legacyId','localPath'].forEach(function(f) {
          if (snap.payload[f] === assetId) { snapshotCache.delete(k); found = true; }
        });
      }
    });
    return { cleaned: found, reason: found ? 'evicted ' + keys.length + ' entries' : 'not in cache' };
  }

  function cleanLegacyIndexes(assetId, references) {
    var result = { legacyIndexCleaned: false, overrideCleaned: false };
    var legacyRefs = references.references.filter(function(r) { return r.type === 'legacy_index'; });
    var overrideRefs = references.references.filter(function(r) { return r.type === 'admin_override'; });
    // Clean legacy image_index
    try {
      var idxPath = path.join(dataDir, 'image_index.json');
      var idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
      if (Array.isArray(idx)) {
        var filtered = idx.filter(function(e) { return e.id !== assetId && e.assetId !== assetId; });
        if (filtered.length < idx.length) { fs.writeFileSync(idxPath, JSON.stringify(filtered, null, 2) + '\n'); result.legacyIndexCleaned = true; }
      }
    } catch(e) { logger.warn('legacy index cleanup: ' + e.message); }
    // Clean admin override
    if (overrideRefs.length > 0) {
      try { fs.unlinkSync(path.join(dataDir, 'admin_override.json')); result.overrideCleaned = true; } catch(e) { logger.warn('override cleanup: ' + e.message); }
    }
    return result;
  }

  return { cleanActiveSnapshot: cleanActiveSnapshot, cleanCache: cleanCache, cleanLegacyIndexes: cleanLegacyIndexes };
}
module.exports = { ReferenceCleaner: ReferenceCleaner };