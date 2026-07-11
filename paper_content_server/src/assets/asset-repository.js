// asset-repository.js — Asset persistence using R1 JsonStore/AtomicFile
// Corrupt repository throws, never silently falls back.

var path = require('path');
var JsonStore = require(path.join(__dirname, '..', 'infra', 'json-store')).JsonStore;
var assetStatus = require('./asset-status');
var { createAsset } = require('./asset-model');

var SCHEMA_VERSION = 1;

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
    }).then(function() {
      logger.info('Asset created: ' + id + ' (' + asset.libraryType + ')');
      return id;
    });
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
      // Validate lifecycle transition if provided
      if (patch.lifecycleStatus && patch.lifecycleStatus !== existing.lifecycleStatus) {
        assetStatus.assertTransition(existing.lifecycleStatus, patch.lifecycleStatus);
      }
      var updated = Object.assign({}, existing, patch, { updatedAt: new Date().toISOString() });
      data.assets[assetId] = updated;
      data.schemaVersion = SCHEMA_VERSION;
      return store.write(data);
    }).then(function() {
      logger.info('Asset updated: ' + assetId);
    });
  }

  function list(filter) {
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      var all = Object.keys(data.assets).map(function(k) { return data.assets[k]; });
      if (!filter) return all;
      return all.filter(function(a) {
        for (var key in filter) {
          if (a[key] !== filter[key]) return false;
        }
        return true;
      });
    });
  }

  function markBlocked(assetId, reason) {
    return update(assetId, { lifecycleStatus: 'BLOCKED', metadata: { blockReason: reason, blockedAt: new Date().toISOString() } });
  }

  function markTombstoned(assetId, reason) {
    return update(assetId, { lifecycleStatus: 'TOMBSTONED', metadata: { tombstoneReason: reason, tombstonedAt: new Date().toISOString() } });
  }

  function count() {
    return store.readOrDefault({ assets: {}, schemaVersion: SCHEMA_VERSION }).then(function(data) {
      return Object.keys(data.assets).length;
    });
  }

  return {
    create: create,
    get: get,
    update: update,
    list: list,
    markBlocked: markBlocked,
    markTombstoned: markTombstoned,
    count: count,
  };
}

module.exports = { AssetRepository: AssetRepository };
