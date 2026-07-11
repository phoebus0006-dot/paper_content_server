// legacy-asset-adapter.js — Read-only adapter mapping legacy records to normalized Asset
// Does NOT modify legacy files. Only used for parity and compatibility.

var path = require('path');
var fs = require('fs');
var { createAsset } = require('./asset-model');

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(e) {
    return null;
  }
}

// Map a legacy study entry to a normalized Asset
function studyToAsset(entry) {
  if (!entry) return null;
  return createAsset({
    libraryType: 'LEGACY_STUDY',
    sourceType: entry.sourceType || 'study',
    sourceUrl: entry.url || null,
    localPath: entry.processedPngPath || null,
    sha256: entry.sha256 || null,
    mimeType: 'image/png',
    width: entry.width || null,
    height: entry.height || null,
    safetyStatus: entry.safetyStatus || 'UNKNOWN',
    qualityStatus: entry.qualityStatus || 'UNKNOWN',
    lifecycleStatus: computeLifecycle(entry),
    metadata: { legacyId: entry.id, originalEntry: entry },
  });
}

// Map a legacy decorative photo entry
function decorativeToAsset(entry) {
  if (!entry) return null;
  return createAsset({
    libraryType: 'LEGACY_DECORATIVE',
    sourceType: entry.sourceType || 'decorative',
    sourceUrl: entry.url || null,
    localPath: entry.processedPngPath || null,
    sha256: entry.sha256 || null,
    mimeType: 'image/png',
    width: entry.width || null,
    height: entry.height || null,
    safetyStatus: entry.safetyStatus || 'UNKNOWN',
    qualityStatus: entry.qualityStatus || 'UNKNOWN',
    lifecycleStatus: computeLifecycle(entry),
    metadata: { legacyId: entry.id, originalEntry: entry },
  });
}

// Map a photo-index entry
function photoIndexToAsset(entry) {
  if (!entry) return null;
  return createAsset({
    libraryType: entry.poolType === 'study_frames' ? 'LEGACY_STUDY' : 'LEGACY_DECORATIVE',
    sourceType: entry.sourceType || 'import',
    sourceUrl: entry.url || null,
    localPath: entry.processedPngPath || null,
    sha256: entry.sha256 || null,
    mimeType: 'image/png',
    width: entry.width || null,
    height: entry.height || null,
    safetyStatus: entry.safetyStatus || 'UNKNOWN',
    qualityStatus: entry.qualityStatus || 'UNKNOWN',
    lifecycleStatus: computeLifecycle(entry),
    metadata: { legacyId: entry.id, originalEntry: entry },
  });
}

// Determine lifecycle from legacy fields
function computeLifecycle(entry) {
  if (entry.safetyStatus === 'UNSAFE') return 'BLOCKED';
  if (entry.tombstonedAt || entry.deletedAt) return 'TOMBSTONED';
  if (entry.selectable === false) return 'VALIDATED';
  if (entry.selectable === true) return 'SELECTABLE';
  return 'DISCOVERED';
}

// Load all legacy assets from known files
function loadAll(dataDir) {
  var results = [];
  var study = readJsonFile(path.join(dataDir, 'fallback_study', 'study_index.json'));
  if (study && Array.isArray(study.entries)) {
    study.entries.forEach(function(e) {
      var asset = studyToAsset(e);
      if (asset) results.push(asset);
    });
  }
  var photoIndex = readJsonFile(path.join(dataDir, 'image_index.json'));
  if (photoIndex && Array.isArray(photoIndex)) {
    photoIndex.forEach(function(e) {
      var asset = photoIndexToAsset(e);
      if (asset) results.push(asset);
    });
  }
  return results;
}

module.exports = {
  studyToAsset: studyToAsset,
  decorativeToAsset: decorativeToAsset,
  photoIndexToAsset: photoIndexToAsset,
  loadAll: loadAll,
};
