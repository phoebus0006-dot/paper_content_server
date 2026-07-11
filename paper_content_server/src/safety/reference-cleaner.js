// reference-cleaner.js — Fail-closed cleanup with uniform result objects
var fs = require('fs');
var path = require('path');

function resultObj(changed, count, errors) {
  return { complete: errors.length === 0, changed: changed, count: count, errors: errors };
}

function ReferenceCleaner(snapshotStore, snapshotCache, publicationHistory, dataDir, logger) {
  dataDir = dataDir || 'data';
  logger = logger || {};

  function cleanCache(assetId) {
    if (!snapshotCache) return resultObj(false, 0, []);
    var keys = snapshotCache.keys(), found = 0, errs = [];
    keys.forEach(function(k) {
      try {
        var snap = snapshotCache.get(k);
        if (snap && snap.payload) {
          var match = ['assetId','photoId','imageId','legacyId','localPath'].some(function(f) { return snap.payload[f] === assetId; });
          if (match) { snapshotCache.delete(k); found++; }
        }
      } catch(e) { errs.push('cache_evict:' + e.message); }
    });
    return resultObj(found > 0, found, errs);
  }

  function isPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      var resolved = path.resolve(filePath);
      var real = fs.realpathSync(resolved);
      var stat = fs.statSync(real);
      if (stat.isDirectory()) return false;
      if (stat.isSymbolicLink()) return false;
      // Must be within data/ or images/ roots
      var dataRoot = path.resolve(dataDir);
      var imagesRoot = path.resolve(path.join(dataDir, '..', 'images'));
      if (real.indexOf(dataRoot) !== 0 && real.indexOf(imagesRoot) !== 0) return false;
      // Not a config/snapshot/frame file
      var base = path.basename(real);
      if (base === 'server.js' || base.endsWith('.json') || base.endsWith('.bin')) return false;
      return true;
    } catch(e) { return false; }
  }

  function cleanLegacyIndexes(assetId, references) {
    var errs = [];
    // Image index
    try {
      var idxPath = path.join(dataDir, 'image_index.json');
      if (fs.existsSync(idxPath)) {
        var idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        if (Array.isArray(idx)) {
          var filtered = idx.filter(function(e) { return e.id !== assetId && e.assetId !== assetId; });
          if (filtered.length < idx.length) { fs.writeFileSync(idxPath, JSON.stringify(filtered, null, 2) + '\n'); }
        }
      }
    } catch(e) { errs.push('image_index:' + e.message); }
    // Admin override
    try {
      var ovPath = path.join(dataDir, 'admin_override.json');
      if (fs.existsSync(ovPath)) {
        var ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
        if (ov.assetId === assetId || ov.photoId === assetId || ov.imageId === assetId) { fs.unlinkSync(ovPath); }
      }
    } catch(e) { errs.push('admin_override:' + e.message); }
    var changed = errs.length === 0;
    return { legacyIndexCleaned: changed, overrideCleaned: changed, complete: errs.length === 0, errors: errs };
  }

  return { cleanCache: cleanCache, cleanLegacyIndexes: cleanLegacyIndexes, isPathAllowed: isPathAllowed };
}
module.exports = { ReferenceCleaner: ReferenceCleaner };
