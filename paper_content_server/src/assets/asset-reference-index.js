// asset-reference-index.js — Reference discovery with snapshotId/assetId in every reference
var path = require('path');
var fs = require('fs');
var ERR_NOT_FOUND = 'NOT_FOUND', ERR_INVALID_JSON = 'INVALID_JSON', ERR_IO = 'IO_ERROR', ERR_DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE';

function classifyError(err) {
  if (err.code === 'ENOENT') return ERR_NOT_FOUND;
  if (err instanceof SyntaxError || String(err.message).indexOf('JSON') >= 0) return ERR_INVALID_JSON;
  return ERR_IO;
}

function extractAssetIdentityKeys(payload) {
  var keys = [];
  if (!payload || typeof payload !== 'object') return keys;
  if (payload.assetId) keys.push(payload.assetId);
  if (payload.photoId) keys.push(payload.photoId);
  if (payload.imageId) keys.push(payload.imageId);
  if (payload.legacyId) keys.push(payload.legacyId);
  if (payload.localPath) keys.push(payload.localPath);
  return keys;
}

function matchesAsset(keys, assetId) { return keys.indexOf(assetId) >= 0; }

function AssetReferenceIndex(dataDir, snapshotStore, publicationHistory, cacheInspector) {
  dataDir = dataDir || 'data';

  function findReferences(assetId) {
    var refs = [], errors = [], complete = true;

    try {
      var idx = JSON.parse(fs.readFileSync(path.join(dataDir, 'image_index.json'), 'utf8'));
      if (Array.isArray(idx)) idx.forEach(function(entry) {
        if (entry.id === assetId || entry.assetId === assetId || entry.processedPngPath === assetId)
          refs.push({ type: 'legacy_index', location: 'image_index.json', assetId: assetId, active: true, removable: true });
      });
    } catch(e) { var c = classifyError(e); if (c !== ERR_NOT_FOUND) errors.push({ source: 'image_index.json', code: c, message: e.message }); }

    try {
      var study = JSON.parse(fs.readFileSync(path.join(dataDir, 'fallback_study', 'study_index.json'), 'utf8'));
      if (study && Array.isArray(study.entries)) study.entries.forEach(function(entry) {
        if (entry.id === assetId || entry.assetId === assetId || entry.processedPngPath === assetId)
          refs.push({ type: 'legacy_index', location: 'study_index.json', assetId: assetId, active: true, removable: true });
      });
    } catch(e) { var c2 = classifyError(e); if (c2 !== ERR_NOT_FOUND) errors.push({ source: 'study_index.json', code: c2, message: e.message }); }

    try {
      var override = JSON.parse(fs.readFileSync(path.join(dataDir, 'admin_override.json'), 'utf8'));
      if (override && matchesAsset(extractAssetIdentityKeys(override), assetId))
        refs.push({ type: 'admin_override', location: 'admin_override.json', assetId: assetId, active: true, removable: true });
    } catch(e) { var c3 = classifyError(e); if (c3 !== ERR_NOT_FOUND) errors.push({ source: 'admin_override.json', code: c3, message: e.message }); }

    return scanSnapshotAndHistory(assetId, refs, errors).then(function(result) {
      if (cacheInspector) {
        try { var cacheRefs = cacheInspector(assetId); if (Array.isArray(cacheRefs)) cacheRefs.forEach(function(r) { result.references.push(r); }); }
        catch(e) { result.errors.push({ source: 'cache', code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message }); result.complete = false; }
      } else { result.references.push({ type: 'cache', location: 'in-memory', active: false, removable: false, status: 'UNKNOWN' }); }
      return result;
    });
  }

  function scanSnapshotAndHistory(assetId, refs, errors) {
    if (!snapshotStore) return Promise.resolve({ assetId: assetId, references: refs, errors: errors, complete: true });
    return snapshotStore.readActive().then(function(active) {
      if (!active || !active.activeSnapshotId) return scanHistory(assetId, refs, errors);
      return snapshotStore.load(active.activeSnapshotId).then(function(snap) {
        if (snap && snap.payload && matchesAsset(extractAssetIdentityKeys(snap.payload), assetId))
          refs.push({ type: 'active_snapshot', snapshotId: active.activeSnapshotId, assetId: assetId, location: 'active-snapshot.json', active: true, removable: false });
        return scanHistory(assetId, refs, errors);
      });
    }).catch(function(e) { errors.push({ source: 'snapshot_store', code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message }); return { assetId: assetId, references: refs, errors: errors, complete: false }; });
  }

  function scanHistory(assetId, refs, errors) {
    if (!publicationHistory) return { assetId: assetId, references: refs, errors: errors, complete: true };
    return publicationHistory.list().then(function(entries) {
      var promises = entries.map(function(entry) {
        if (entry.assetId === assetId || entry.snapshotId === assetId) {
          refs.push({ type: 'publication_history', snapshotId: entry.snapshotId, historyEntryId: entry.id, assetId: assetId, location: entry.snapshotId, active: false, removable: false });
          return Promise.resolve();
        }
        if (entry.snapshotId && snapshotStore)
          return snapshotStore.load(entry.snapshotId).then(function(snap) {
            if (snap && snap.payload && matchesAsset(extractAssetIdentityKeys(snap.payload), assetId))
              refs.push({ type: 'publication_history', snapshotId: entry.snapshotId, historyEntryId: entry.id, assetId: assetId, location: entry.snapshotId, active: false, removable: false });
          }).catch(function(e) { errors.push({ source: 'history_snapshot:' + entry.snapshotId, code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message }); });
        return Promise.resolve();
      });
      return Promise.all(promises).then(function() { return { assetId: assetId, references: refs, errors: errors, complete: errors.length === 0 }; });
    }).catch(function(e) { errors.push({ source: 'publication_history', code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message }); return { assetId: assetId, references: refs, errors: errors, complete: false }; });
  }

  return { findReferences: findReferences };
}
module.exports = { AssetReferenceIndex: AssetReferenceIndex, extractAssetIdentityKeys: extractAssetIdentityKeys };