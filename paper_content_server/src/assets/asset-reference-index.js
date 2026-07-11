// asset-reference-index.js — Accurate reference discovery with error classification
// complete=false when errors prevent full scan; deletion gate requires complete=true

var path = require('path');
var fs = require('fs');

var ERR_NOT_FOUND = 'NOT_FOUND';
var ERR_INVALID_JSON = 'INVALID_JSON';
var ERR_IO = 'IO_ERROR';
var ERR_DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE';

function classifyError(err) {
  if (err.code === 'ENOENT') return ERR_NOT_FOUND;
  if (err instanceof SyntaxError || err.message.indexOf('JSON') >= 0) return ERR_INVALID_JSON;
  return ERR_IO;
}

// Extract asset identity keys from snapshot payload for matching
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

function AssetReferenceIndex(dataDir, snapshotStore, publicationHistory, cacheInspector) {
  dataDir = dataDir || 'data';

  function findReferences(assetId) {
    var refs = [];
    var errors = [];
    var complete = true;

    // 1. Legacy image_index.json — exact ID match
    try {
      var idx = JSON.parse(fs.readFileSync(path.join(dataDir, 'image_index.json'), 'utf8'));
      if (Array.isArray(idx)) {
        idx.forEach(function(entry) {
          if (entry.id === assetId || entry.assetId === assetId ||
              entry.localPath === assetId || entry.processedPngPath === assetId) {
            refs.push({ type: 'legacy_index', location: 'image_index.json', active: true, removable: true });
          }
        });
      }
    } catch(e) {
      var cls = classifyError(e);
      if (cls !== ERR_NOT_FOUND) { errors.push({ source: 'image_index.json', code: cls, message: e.message }); }
    }

    // 2. Legacy study index
    try {
      var study = JSON.parse(fs.readFileSync(path.join(dataDir, 'fallback_study', 'study_index.json'), 'utf8'));
      if (study && Array.isArray(study.entries)) {
        study.entries.forEach(function(entry) {
          if (entry.id === assetId || entry.assetId === assetId ||
              entry.processedPngPath === assetId) {
            refs.push({ type: 'legacy_index', location: 'study_index.json', active: true, removable: true });
          }
        });
      }
    } catch(e) {
      var cls2 = classifyError(e);
      if (cls2 !== ERR_NOT_FOUND) { errors.push({ source: 'study_index.json', code: cls2, message: e.message }); }
    }

    // 3. Admin override — only if explicitly references target
    try {
      var override = JSON.parse(fs.readFileSync(path.join(dataDir, 'admin_override.json'), 'utf8'));
      if (override) {
        var overrideKeys = extractAssetIdentityKeys(override);
        if (overrideKeys.indexOf(assetId) >= 0 || overrideKeys.indexOf(assetId) >= 0) {
          refs.push({ type: 'admin_override', location: 'admin_override.json', active: true, removable: true });
        }
      }
    } catch(e) {
      var cls3 = classifyError(e);
      if (cls3 !== ERR_NOT_FOUND) { errors.push({ source: 'admin_override.json', code: cls3, message: e.message }); }
    }

    // 4. Active snapshot + publication history (async, handled with promise)
    return scanSnapshotAndHistory(assetId, refs, errors).then(function(result) {
      // 5. Cache inspector (if available)
      if (cacheInspector) {
        try {
          var cacheRefs = cacheInspector(assetId);
          if (Array.isArray(cacheRefs)) {
            cacheRefs.forEach(function(r) { result.references.push(r); });
          }
        } catch(e) {
          result.errors.push({ source: 'cache', code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message });
          result.complete = false;
        }
      } else {
        result.references.push({ type: 'cache', location: 'in-memory', active: false, removable: false, status: 'UNKNOWN' });
      }
      return result;
    });
  }

  function scanSnapshotAndHistory(assetId, refs, errors) {
    if (!snapshotStore) {
      return Promise.resolve({ assetId: assetId, references: refs, errors: errors, complete: true });
    }
    return snapshotStore.readActive().then(function(active) {
      if (active && active.activeSnapshotId) {
        return snapshotStore.load(active.activeSnapshotId).then(function(snap) {
          if (snap && snap.payload) {
            var identityKeys = extractAssetIdentityKeys(snap.payload);
            var match = identityKeys.some(function(k) { return k === assetId || (snap.frameId && snap.frameId.indexOf(assetId) >= 0); });
            if (match) {
              refs.push({ type: 'active_snapshot', location: 'active-snapshot.json', active: true, removable: false });
            }
          }
          return scanHistory(assetId, refs, errors);
        });
      }
      return scanHistory(assetId, refs, errors);
    }).catch(function(e) {
      errors.push({ source: 'snapshot_store', code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message });
      return { assetId: assetId, references: refs, errors: errors, complete: false };
    });
  }

  function scanHistory(assetId, refs, errors) {
    if (!publicationHistory) {
      return { assetId: assetId, references: refs, errors: errors, complete: true };
    }
    return publicationHistory.list().then(function(entries) {
      var historyPromises = entries.map(function(entry) {
        // Check entry fields directly
        if (entry.assetId === assetId || entry.snapshotId === assetId) {
          refs.push({ type: 'publication_history', location: 'history.json', active: false, removable: false });
          return;
        }
        // If snapshotId available and not already matched by text, load and check payload
        if (entry.snapshotId && snapshotStore) {
          return snapshotStore.load(entry.snapshotId).then(function(snap) {
            if (snap && snap.payload) {
              var keys = extractAssetIdentityKeys(snap.payload);
              if (keys.some(function(k) { return k === assetId; })) {
                refs.push({ type: 'publication_history', location: 'history.json', active: false, removable: false });
              }
            }
          }).catch(function() {});
        }
      });
      return Promise.all(historyPromises).then(function() {
        return { assetId: assetId, references: refs, errors: errors, complete: true };
      });
    }).catch(function(e) {
      errors.push({ source: 'publication_history', code: ERR_DEPENDENCY_UNAVAILABLE, message: e.message });
      return { assetId: assetId, references: refs, errors: errors, complete: false };
    });
  }

  return { findReferences: findReferences };
}

module.exports = { AssetReferenceIndex: AssetReferenceIndex, extractAssetIdentityKeys: extractAssetIdentityKeys };
