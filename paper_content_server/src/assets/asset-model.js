// asset-model.js — Normalized asset domain object
// schemaVersion 1 — immutable after creation

var crypto = require('crypto');

var SCHEMA_VERSION = 1;

function createAssetId() {
  return 'ast_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function createAsset(fields) {
  if (!fields.sourceUrl && !fields.localPath) {
    throw new Error('asset must have sourceUrl or localPath');
  }
  if (!fields.libraryType) throw new Error('libraryType is required');

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    assetId: fields.assetId || createAssetId(),
    libraryType: fields.libraryType,
    sourceType: fields.sourceType || 'unknown',
    sourceUrl: fields.sourceUrl || null,
    localPath: fields.localPath || null,
    sha256: fields.sha256 || null,
    mimeType: fields.mimeType || null,
    width: fields.width || null,
    height: fields.height || null,
    rightsStatus: fields.rightsStatus || null,
    decodeStatus: fields.decodeStatus || 'PENDING',
    safetyStatus: fields.safetyStatus || 'UNKNOWN',
    relevanceStatus: fields.relevanceStatus || 'UNKNOWN',
    qualityStatus: fields.qualityStatus || 'UNKNOWN',
    lifecycleStatus: fields.lifecycleStatus || 'DISCOVERED',
    createdAt: fields.createdAt || new Date().toISOString(),
    updatedAt: fields.updatedAt || new Date().toISOString(),
    deletedAt: fields.deletedAt || null,
    metadata: fields.metadata || {},
  });
}

function isSelectable(asset) {
  return asset.safetyStatus === 'SAFE' && asset.lifecycleStatus === 'SELECTABLE';
}

module.exports = {
  createAsset: createAsset,
  isSelectable: isSelectable,
  SCHEMA_VERSION: SCHEMA_VERSION,
};
