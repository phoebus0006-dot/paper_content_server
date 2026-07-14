// asset-model.js — Normalized asset domain object with enum validation
// schemaVersion 1 — immutable after creation

var crypto = require('crypto');
var status = require('./asset-status');

var SCHEMA_VERSION = 1;
var FROZEN_FIELDS = ['assetId','schemaVersion','createdAt'];

function createAsset(fields) {
  if (!fields.sourceUrl && !fields.localPath) throw new Error('asset must have sourceUrl or localPath');
  if (!fields.libraryType) throw new Error('libraryType is required');
  if (!status.isValidEnum(fields.libraryType, status.LIBRARY_TYPE_LIST)) {
    throw new Error('Invalid libraryType: ' + fields.libraryType);
  }
  if (fields.safetyStatus && !status.isValidEnum(fields.safetyStatus, status.SAFETY_STATUS_LIST)) {
    throw new Error('Invalid safetyStatus: ' + fields.safetyStatus);
  }
  if (fields.lifecycleStatus && !status.isValidEnum(fields.lifecycleStatus, status.LIFECYCLE_STATUS_LIST)) {
    throw new Error('Invalid lifecycleStatus: ' + fields.lifecycleStatus);
  }
  if (fields.decodeStatus && !status.isValidEnum(fields.decodeStatus, status.DECODE_STATUS_LIST)) {
    throw new Error('Invalid decodeStatus: ' + fields.decodeStatus);
  }
  if (fields.relevanceStatus && !status.isValidEnum(fields.relevanceStatus, status.RELEVANCE_STATUS_LIST)) {
    throw new Error('Invalid relevanceStatus: ' + fields.relevanceStatus);
  }
  if (fields.qualityStatus && !status.isValidEnum(fields.qualityStatus, status.QUALITY_STATUS_LIST)) {
    throw new Error('Invalid qualityStatus: ' + fields.qualityStatus);
  }
  // SELECTABLE requires SAFE
  if (fields.lifecycleStatus === 'SELECTABLE' && fields.safetyStatus !== 'SAFE') {
    throw new Error('SELECTABLE lifecycle requires safetyStatus=SAFE');
  }

  var assetId = fields.assetId || 'ast_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    assetId: assetId,
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
  return asset && asset.safetyStatus === 'SAFE' && asset.lifecycleStatus === 'SELECTABLE';
}

module.exports = {
  createAsset: createAsset,
  isSelectable: isSelectable,
  SCHEMA_VERSION: SCHEMA_VERSION,
  FROZEN_FIELDS: FROZEN_FIELDS,
};
