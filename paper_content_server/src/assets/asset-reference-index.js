// asset-reference-index.js — Read-only reference discovery for assets
// Identifies where an asset is referenced across the system.
// Used by Safety Delete Pipeline (R4.2) — does NOT delete anything.

var path = require('path');
var fs = require('fs');

function AssetReferenceIndex(dataDir, snapshotStore, publicationHistory) {
  dataDir = dataDir || 'data';

  function findReferences(assetId) {
    var refs = [];

    // 1. Legacy photo index
    try {
      var idx = JSON.parse(fs.readFileSync(path.join(dataDir, 'image_index.json'), 'utf8'));
      if (Array.isArray(idx)) {
        idx.forEach(function(entry) {
          if (entry.id === assetId) {
            refs.push({ type: 'legacy_index', location: 'image_index.json', active: true, removable: true });
          }
        });
      }
    } catch(e) {}

    // 2. Legacy study index
    try {
      var study = JSON.parse(fs.readFileSync(path.join(dataDir, 'fallback_study', 'study_index.json'), 'utf8'));
      if (study && Array.isArray(study.entries)) {
        study.entries.forEach(function(entry) {
          if (entry.id === assetId) {
            refs.push({ type: 'legacy_index', location: 'study_index.json', active: true, removable: true });
          }
        });
      }
    } catch(e) {}

    // 3. Active snapshot payload
    if (snapshotStore) {
      try {
        return snapshotStore.readActive().then(function(active) {
          if (active) {
            refs.push({ type: 'active_snapshot', location: 'active-snapshot.json', active: true, removable: false });
          }
          return snapshotStore.load(active ? active.activeSnapshotId : null);
        }).then(function(snap) {
          if (snap && snap.payload) {
            var pid = snap.payload.photoId || snap.payload.imageName || null;
            if (pid === assetId) {
              refs.push({ type: 'active_snapshot_payload', location: 'snapshot payload', active: true, removable: false });
            }
          }
          // 4. Publication history
          if (publicationHistory) {
            return publicationHistory.list().then(function(entries) {
              entries.forEach(function(e) {
                if (e.snapshotId && e.snapshotId.indexOf(assetId) >= 0) {
                  refs.push({ type: 'publication_history', location: 'history.json', active: false, removable: false });
                }
              });
              return { assetId: assetId, references: refs };
            });
          }
          return { assetId: assetId, references: refs };
        });
      } catch(e) {
        return Promise.resolve({ assetId: assetId, references: refs });
      }
    }

    // 5. Admin override
    try {
      var override = JSON.parse(fs.readFileSync(path.join(dataDir, 'admin_override.json'), 'utf8'));
      if (override && override.mode) {
        refs.push({ type: 'admin_override', location: 'admin_override.json', active: true, removable: true });
      }
    } catch(e) {}

    return Promise.resolve({ assetId: assetId, references: refs });
  }

  return {
    findReferences: findReferences,
  };
}

module.exports = { AssetReferenceIndex: AssetReferenceIndex };
