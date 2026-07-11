// legacy-asset-adapter.js — Read-only adapter with stable deterministic IDs
var path = require('path');
var fs = require('fs');
var { createAsset } = require('./asset-model');
var { legacyAssetId } = require('./asset-status');

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch(e) { return null; }
}

function computeLifecycle(entry) {
  if (entry.safetyStatus === 'UNSAFE') return 'BLOCKED';
  if (entry.tombstonedAt || entry.deletedAt) return 'TOMBSTONED';
  if (entry.selectable === false) return 'VALIDATED';
  if (entry.selectable === true) return 'SELECTABLE';
  return 'DISCOVERED';
}

function computeSafety(entry) {
  if (entry.safetyStatus === 'UNSAFE') return 'UNSAFE';
  if (entry.safetyStatus === 'SAFE') return 'SAFE';
  if (entry.safetyStatus === 'SUSPICIOUS') return 'SUSPICIOUS';
  return 'UNKNOWN';
}

function studyToAsset(entry) {
  if (!entry) return null;
  var id = legacyAssetId('study', entry.id, entry.processedPngPath, entry.url);
  return createAsset({
    assetId: id, libraryType: 'LEGACY_STUDY',
    sourceType: entry.sourceType || 'study',
    sourceUrl: entry.url || null, localPath: entry.processedPngPath || null,
    sha256: entry.sha256 || null, mimeType: 'image/png',
    width: entry.width || null, height: entry.height || null,
    safetyStatus: computeSafety(entry),
    lifecycleStatus: computeLifecycle(entry),
    metadata: { legacyId: entry.id },
  });
}

function decorativeToAsset(entry) {
  if (!entry) return null;
  var id = legacyAssetId('decorative', entry.id, entry.processedPngPath, entry.url);
  return createAsset({
    assetId: id, libraryType: 'LEGACY_DECORATIVE',
    sourceType: entry.sourceType || 'decorative',
    sourceUrl: entry.url || null, localPath: entry.processedPngPath || null,
    sha256: entry.sha256 || null, mimeType: 'image/png',
    width: entry.width || null, height: entry.height || null,
    safetyStatus: computeSafety(entry),
    lifecycleStatus: computeLifecycle(entry),
    metadata: { legacyId: entry.id },
  });
}

function photoIndexToAsset(entry) {
  if (!entry) return null;
  var ns = entry.poolType === 'study_frames' ? 'study' : 'decorative';
  var id = legacyAssetId(ns, entry.id, entry.processedPngPath, entry.url);
  return createAsset({
    assetId: id,
    libraryType: ns === 'study' ? 'LEGACY_STUDY' : 'LEGACY_DECORATIVE',
    sourceType: entry.sourceType || 'import',
    sourceUrl: entry.url || null, localPath: entry.processedPngPath || null,
    sha256: entry.sha256 || null, mimeType: 'image/png',
    width: entry.width || null, height: entry.height || null,
    safetyStatus: computeSafety(entry),
    lifecycleStatus: computeLifecycle(entry),
    metadata: { legacyId: entry.id },
  });
}

function loadAll(dataDir) {
  var results = [];
  var study = readJsonFile(path.join(dataDir, 'fallback_study', 'study_index.json'));
  if (study && Array.isArray(study.entries)) { study.entries.forEach(function(e) { var a = studyToAsset(e); if (a) results.push(a); }); }
  var pi = readJsonFile(path.join(dataDir, 'image_index.json'));
  if (pi && Array.isArray(pi)) { pi.forEach(function(e) { var a = photoIndexToAsset(e); if (a) results.push(a); }); }
  return results;
}

module.exports = { studyToAsset, decorativeToAsset, photoIndexToAsset, loadAll };
