// asset-repository.js — Asset persistence with guarded fields and metadata merge
var path = require('path');
var JsonStore = require(path.join(__dirname, '..', 'infra', 'json-store')).JsonStore;
var ast = require('./asset-status');
var { FROZEN_FIELDS } = require('./asset-model');

var SCHEMA_VERSION = 1;
var GUARDED_FIELDS = ['assetId','schemaVersion','createdAt','libraryType'];

function AssetRepository(storeFile, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };
  var store = JsonStore(storeFile, { schemaVersion: SCHEMA_VERSION });

  function create(asset) {
    var id = asset.assetId;
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      if (data.assets[id]) throw new Error('asset already exists: ' + id);
      data.assets[id] = asset;
      data.schemaVersion = SCHEMA_VERSION;
      return store.write(data);
    }).then(function() { logger.info('Asset created: ' + id + ' (' + asset.libraryType + ')'); return id; });
  }

  function get(assetId) {
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      return data.assets[assetId] || null;
    });
  }

  function update(assetId, patch) {
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      var existing = data.assets[assetId];
      if (!existing) throw new Error('asset not found: ' + assetId);
      // Guard immutable fields
      GUARDED_FIELDS.forEach(function(f) {
        if (patch[f] !== undefined && patch[f] !== existing[f]) {
          throw new Error('Cannot modify guarded field: ' + f);
        }
      });
      // Validate lifecycle transition
      if (patch.lifecycleStatus && patch.lifecycleStatus !== existing.lifecycleStatus) {
        ast.assertTransition(existing.lifecycleStatus, patch.lifecycleStatus);
      }
      // Merge metadata (don't overwrite)
      var mergedMeta = {};
      if (existing.metadata) { Object.keys(existing.metadata).forEach(function(k) { mergedMeta[k] = existing.metadata[k]; }); }
      if (patch.metadata) { Object.keys(patch.metadata).forEach(function(k) { mergedMeta[k] = patch.metadata[k]; }); }
      var safePatch = {};
      Object.keys(patch).forEach(function(k) { safePatch[k] = patch[k]; });
      safePatch.metadata = mergedMeta;
      safePatch.updatedAt = new Date().toISOString();
      var updated = Object.assign({}, existing, safePatch);
      data.assets[assetId] = updated;
      data.schemaVersion = SCHEMA_VERSION;
      return store.write(data);
    }).then(function() { logger.info('Asset updated: ' + assetId); });
  }

  function list(filter) {
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      var all = Object.keys(data.assets).map(function(k) { return data.assets[k]; });
      if (!filter) return all;
      return all.filter(function(a) {
        for (var key in filter) { if (a[key] !== filter[key]) return false; }
        return true;
      });
    });
  }

  function markBlocked(assetId, reason, safetyOverride) {
    var patch = {
      lifecycleStatus: 'BLOCKED',
      safetyStatus: safetyOverride || 'UNSAFE',
      metadata: { blockReason: reason, blockedAt: new Date().toISOString() },
    };
    return update(assetId, patch);
  }

  function markTombstoned(assetId, reason) {
    return update(assetId, {
      lifecycleStatus: 'TOMBSTONED',
      metadata: { tombstoneReason: reason, tombstonedAt: new Date().toISOString() },
    });
  }

  function count() {
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      return Object.keys(data.assets).length;
    });
  }

  return { create, get, update, list, markBlocked, markTombstoned, count };
}

module.exports = { AssetRepository: AssetRepository };
