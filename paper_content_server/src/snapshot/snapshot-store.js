// snapshot-store.js — Immutable snapshot persistence with integrity verification
// save: validate → write frame → write meta → reload → verify hash
// load: read meta → read frame → validate length/EPF1/hash → reject corrupt

var path = require('path');
var fs = require('fs');
var fsp = fs.promises;
var crypto = require('crypto');
var writeFileAtomic = require(path.join(__dirname, '..', 'infra', 'atomic-file')).writeFileAtomic;
var snapshotModel = require('./snapshot-model');
var epaperEpf1 = require(path.join(__dirname, '..', 'epaper', 'epf1'));

var ACTIVE_SCHEMA_VERSION = 1;
var EPF1_FRAME_SIZE = 192010;

function SnapshotIntegrityError(message) {
  this.code = 'SNAPSHOT_INTEGRITY_ERROR';
  this.message = message;
}

function computeSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function validateFrame(frame, expectedLength, expectedSha256) {
  if (frame.length !== expectedLength) {
    throw new SnapshotIntegrityError('frame length mismatch: expected ' + expectedLength + ' got ' + frame.length);
  }
  if (frame.length < 4 || frame.toString('ascii', 0, 4) !== 'EPF1') {
    throw new SnapshotIntegrityError('invalid EPF1 magic: ' + (frame.length >= 4 ? frame.toString('ascii', 0, 4) : 'too short'));
  }
  var actualSha = computeSha256(frame);
  if (actualSha !== expectedSha256) {
    throw new SnapshotIntegrityError('frame SHA256 mismatch: expected ' + expectedSha256 + ' got ' + actualSha);
  }
}

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

  // Persist a snapshot: validate → write frame → write meta → reload → verify
  function save(snapshot) {
    if (!snapshot || !snapshot.frame || !snapshot.snapshotId) {
      return Promise.reject(new Error('invalid snapshot object'));
    }
    var meta = snapshotModel.serializeMeta(snapshot);
    var metaStr = JSON.stringify(meta, null, 2) + '\n';

    return ensureDirs().then(function() {
      return writeFileAtomic(framePath(snapshot.snapshotId), snapshot.frame, { encoding: 'binary' });
    }).then(function() {
      return writeFileAtomic(metaPath(snapshot.snapshotId), metaStr, { encoding: 'utf8' });
    }).then(function() {
      return fsp.readFile(framePath(snapshot.snapshotId));
    }).then(function(persistedFrame) {
      validateFrame(persistedFrame, snapshot.frameLength || snapshot.frame.length, snapshot.frameSha256);
      logger.info('Snapshot saved and verified: ' + snapshot.snapshotId);
      return snapshot.snapshotId;
    });
  }

  // Load a complete snapshot with integrity validation
  function load(snapshotId) {
    var meta, frameBytes;
    return fsp.readFile(metaPath(snapshotId), 'utf8').then(function(text) {
      meta = JSON.parse(text);
      return fsp.readFile(framePath(snapshotId));
    }).then(function(frame) {
      frameBytes = frame;
      if (!meta.frameSha256) return null;
      validateFrame(frameBytes, meta.frameLength || frameBytes.length, meta.frameSha256);
      return Object.freeze({
        snapshotId: meta.snapshotId,
        frameId: meta.frameId,
        payload: meta.payload,
        frame: frameBytes,
        mode: meta.mode,
        frameSha256: meta.frameSha256,
        frameLength: meta.frameLength,
        contentHash: meta.contentHash,
        createdAt: meta.createdAt,
        schemaVersion: meta.schemaVersion,
      });
    }).catch(function(err) {
      if (err.code === 'ENOENT') return null;
      if (err instanceof SnapshotIntegrityError) throw err;
      throw new SnapshotIntegrityError('load failed for ' + snapshotId + ': ' + (err.message || err));
    });
  }

  // Activate with integrity validation: load + verify before writing active pointer
  function activate(snapshotId) {
    var loaded;
    return load(snapshotId).then(function(snap) {
      if (!snap) throw new Error('snapshot not found: ' + snapshotId);
      loaded = snap;
      var active = {
        activeSnapshotId: snapshotId,
        frameSha256: snap.frameSha256,
        frameLength: snap.frameLength,
        updatedAt: new Date().toISOString(),
        schemaVersion: ACTIVE_SCHEMA_VERSION,
      };
      return writeFileAtomic(
        path.join(publicationDir, 'active-snapshot.json'),
        JSON.stringify(active, null, 2) + '\n',
        { encoding: 'utf8' }
      );
    }).then(function() {
      logger.info('Active snapshot set to: ' + snapshotId + ' (frameSha=' + loaded.frameSha256.slice(0, 8) + ')');
    });
  }

  function readActive() {
    var activeFile = path.join(publicationDir, 'active-snapshot.json');
    return fsp.readFile(activeFile, 'utf8').then(function(text) {
      return JSON.parse(text);
    }).catch(function(err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
  }

  function listSnapshots() {
    return fsp.readdir(snapshotsDir).then(function(files) {
      var seen = {};
      files.filter(function(f) { return f.endsWith('.json') && f !== 'active-snapshot.json'; }).forEach(function(f) {
        seen[f.slice(0, -5)] = true;
      });
      var ids = Object.keys(seen).sort().reverse();
      return ids;
    }).catch(function(err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    });
  }

  function deleteAll() {
    return listSnapshots().then(function(ids) {
      var unlinks = ids.map(function(id) {
        return fsp.unlink(metaPath(id)).catch(function() {}).then(function() {
          return fsp.unlink(framePath(id)).catch(function() {});
        });
      });
      return Promise.all(unlinks);
    }).then(function() {
      return fsp.unlink(path.join(publicationDir, 'active-snapshot.json')).catch(function() {});
    });
  }

  return {
    save: save,
    load: load,
    activate: activate,
    readActive: readActive,
    listSnapshots: listSnapshots,
    deleteAll: deleteAll,
    ensureDirs: ensureDirs,
    snapshotsDir: snapshotsDir,
    publicationDir: publicationDir,
  };
}

module.exports = { SnapshotStore: SnapshotStore, ACTIVE_SCHEMA_VERSION: ACTIVE_SCHEMA_VERSION, SnapshotIntegrityError: SnapshotIntegrityError };
