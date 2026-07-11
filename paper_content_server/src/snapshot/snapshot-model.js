// snapshot-model.js — Immutable snapshot data model for R3 persistence
// A snapshot binds a frameId, the state metadata (payload), and the raw
// EPF1 frame bytes into one immutable record.  Once created, the object
// is frozen so no caller can accidentally mutate it.

var crypto = require('crypto');

var SCHEMA_VERSION = 1;

function createSnapshot(frameId, payload, frame, mode) {
  if (!frameId || typeof frameId !== 'string') throw new Error('frameId must be a non-empty string');
  if (!payload || typeof payload !== 'object') throw new Error('payload must be an object');
  if (!Buffer.isBuffer(frame) || frame.length === 0) throw new Error('frame must be a non-empty Buffer');
  if (mode !== 'news' && mode !== 'photo') throw new Error('mode must be "news" or "photo"');

  var snapshotId = 'snap_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  var createdAt = new Date().toISOString();

  return Object.freeze({
    snapshotId: snapshotId,
    frameId: frameId,
    payload: payload,
    frame: frame,
    mode: mode,
    createdAt: createdAt,
    schemaVersion: SCHEMA_VERSION,
  });
}

// Serialize a snapshot to a JSON-safe object (frame is excluded — stored separately)
function serializeMeta(snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    frameId: snapshot.frameId,
    payload: snapshot.payload,
    mode: snapshot.mode,
    createdAt: snapshot.createdAt,
    schemaVersion: snapshot.schemaVersion,
  };
}

module.exports = {
  createSnapshot: createSnapshot,
  serializeMeta: serializeMeta,
  SCHEMA_VERSION: SCHEMA_VERSION,
};
