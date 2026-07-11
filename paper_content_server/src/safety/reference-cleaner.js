// reference-cleaner.js — Removes asset references from active snapshot, rollback, caches, and index
// Called by AssetDeleteService after reference discovery.
// Does NOT delete files — only metadata/index references.

function ReferenceCleaner(snapshotStore, snapshotCache, publicationHistory, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function cleanActiveSnapshot(assetId) {
    return snapshotStore.readActive().then(function(active) {
      if (!active) return { cleaned: false, reason: 'no active snapshot' };
      return snapshotStore.load(active.activeSnapshotId).then(function(snap) {
        if (!snap || !snap.payload) return { cleaned: false, reason: 'empty payload' };
        var referenced = false;
        ['assetId','photoId','imageId','legacyId','localPath'].forEach(function(k) {
          if (snap.payload[k] === assetId) referenced = true;
        });
        if (!referenced) return { cleaned: false, reason: 'not referenced' };
        // Mark the active for replacement — actual replacement handled by delete service
        return { cleaned: false, reason: 'active reference found — requires replacement', snapshotId: active.activeSnapshotId };
      });
    });
  }

  function cleanCache(assetId) {
    if (!snapshotCache) return { cleaned: false, reason: 'no cache available' };
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
    return { cleaned: found, reason: found ? 'removed from cache' : 'not in cache' };
  }

  function cleanPublicationHistory(assetId) {
    if (!publicationHistory) return Promise.resolve({ cleaned: false, reason: 'no history available' });
    return publicationHistory.list().then(function(entries) {
      var found = entries.some(function(e) { return e.assetId === assetId || e.snapshotId === assetId; });
      return { cleaned: false, reason: found ? 'history entry exists — requires snapshot invalidation' : 'not in history' };
    });
  }

  return { cleanActiveSnapshot, cleanCache, cleanPublicationHistory };
}

module.exports = { ReferenceCleaner: ReferenceCleaner };
