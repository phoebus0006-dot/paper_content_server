// snapshot-store.js — Immutable snapshot persistence using R1 infra
// Snapshots are stored as two files per snapshot:
//   data/snapshots/{snapshotId}.json  — metadata (payload, frameId, mode)
//   data/snapshots/{snapshotId}.bin   — raw EPF1 frame bytes
// Active pointer: data/publication/active-snapshot.json

var path = require('path');
var fs = require('fs');
var fsp = fs.promises;
var JsonStore = require(path.join(__dirname, '..', 'infra', 'json-store')).JsonStore;
var writeFileAtomic = require(path.join(__dirname, '..', 'infra', 'atomic-file')).writeFileAtomic;

var ACTIVE_SCHEMA_VERSION = 1;

function SnapshotStore(snapshotsDir, publicationDir, logger) {
  snapshotsDir = snapshotsDir || 'data/snapshots';
  publicationDir = publicationDir || 'data/publication';
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function ensureDirs() {
    return fsp.mkdir(snapshotsDir, { recursive: true }).then(function() {
      return fsp.mkdir(publicationDir, { recursive: true });
    });
  }

  function metaPath(snapshotId) {
    return path.join(snapshotsDir, snapshotId + '.json');
  }

  function framePath(snapshotId) {
    return path.join(snapshotsDir, snapshotId + '.bin');
  }

  // Persist a snapshot: write metadata JSON + frame binary
  function save(snapshot) {
    var meta = {
      snapshotId: snapshot.snapshotId,
      frameId: snapshot.frameId,
      payload: snapshot.payload,
      mode: snapshot.mode,
      createdAt: snapshot.createdAt,
      schemaVersion: snapshot.schemaVersion,
    };
    var metaStr = JSON.stringify(meta, null, 2) + '\n';

    return ensureDirs().then(function() {
      return writeFileAtomic(metaPath(snapshot.snapshotId), metaStr, { encoding: 'utf8' });
    }).then(function() {
      return writeFileAtomic(framePath(snapshot.snapshotId), snapshot.frame, { encoding: 'binary' });
    }).then(function() {
      logger.info('Snapshot saved: ' + snapshot.snapshotId + ' (frameId=' + snapshot.frameId + ')');
      return snapshot.snapshotId;
    });
  }

  // Load a snapshot's metadata
  function loadMeta(snapshotId) {
    return fsp.readFile(metaPath(snapshotId), 'utf8').then(function(text) {
      return JSON.parse(text);
    }).catch(function(err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
  }

  // Load a snapshot's frame buffer
  function loadFrame(snapshotId) {
    return fsp.readFile(framePath(snapshotId)).catch(function(err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
  }

  // Load a complete snapshot (meta + frame)
  function load(snapshotId) {
    return Promise.all([loadMeta(snapshotId), loadFrame(snapshotId)]).then(function(results) {
      var meta = results[0];
      var frame = results[1];
      if (!meta || !frame) return null;
      return Object.freeze({
        snapshotId: meta.snapshotId,
        frameId: meta.frameId,
        payload: meta.payload,
        frame: frame,
        mode: meta.mode,
        createdAt: meta.createdAt,
        schemaVersion: meta.schemaVersion,
      });
    });
  }

  // Atomically set the active snapshot pointer
  function activate(snapshotId) {
    var active = {
      activeSnapshotId: snapshotId,
      updatedAt: new Date().toISOString(),
      schemaVersion: ACTIVE_SCHEMA_VERSION,
    };
    var activeFile = path.join(publicationDir, 'active-snapshot.json');
    return writeFileAtomic(activeFile, JSON.stringify(active, null, 2) + '\n', { encoding: 'utf8' }).then(function() {
      logger.info('Active snapshot set to: ' + snapshotId);
    });
  }

  // Read the current active snapshot pointer
  function readActive() {
    var activeFile = path.join(publicationDir, 'active-snapshot.json');
    return fsp.readFile(activeFile, 'utf8').then(function(text) {
      return JSON.parse(text);
    }).catch(function(err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
  }

  // List all snapshot IDs sorted by creation time (descending)
  function listSnapshots() {
    return fsp.readdir(snapshotsDir).then(function(files) {
      var seen = {};
      files.filter(function(f) { return f.endsWith('.json') && f !== 'active-snapshot.json'; }).forEach(function(f) {
        var id = f.slice(0, -5);
        seen[id] = true;
      });
      var ids = Object.keys(seen).sort().reverse();
      return ids;
    }).catch(function(err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    });
  }

  // Delete all snapshots (used for cleanup in tests)
  function deleteAll() {
    return listSnapshots().then(function(ids) {
      var unlinks = ids.map(function(id) {
        return fsp.unlink(metaPath(id)).catch(function() {}).then(function() {
          return fsp.unlink(framePath(id)).catch(function() {});
        });
      });
      return Promise.all(unlinks);
    }).then(function() {
      var activeFile = path.join(publicationDir, 'active-snapshot.json');
      return fsp.unlink(activeFile).catch(function() {});
    });
  }

  return {
    save: save,
    load: load,
    loadMeta: loadMeta,
    loadFrame: loadFrame,
    activate: activate,
    readActive: readActive,
    listSnapshots: listSnapshots,
    deleteAll: deleteAll,
    ensureDirs: ensureDirs,
    snapshotsDir: snapshotsDir,
    publicationDir: publicationDir,
  };
}

module.exports = { SnapshotStore: SnapshotStore, ACTIVE_SCHEMA_VERSION: ACTIVE_SCHEMA_VERSION };
