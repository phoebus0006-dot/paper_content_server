// snapshot-model.js — Immutable snapshot data model for R3 persistence
// Includes integrity metadata: frameSha256, frameLength, contentHash.

var crypto = require('crypto');

var SCHEMA_VERSION = 2;
var ERR_INTEGRITY = 'SNAPSHOT_INTEGRITY_ERROR';

function SnapshotIntegrityError(message) {
  this.code = ERR_INTEGRITY;
  this.message = message;
}

function computeFrameSha256(frame) {
  return crypto.createHash('sha256').update(frame).digest('hex');
}

function computeContentHash(frameId, payload, mode) {
  return crypto.createHash('sha256').update(frameId + '|' + mode).digest('hex').slice(0, 16);
}

function createSnapshot(frameId, payload, frame, mode) {
  if (!frameId || typeof frameId !== 'string') throw new Error('frameId must be a non-empty string');
  if (!payload || typeof payload !== 'object') throw new Error('payload must be an object');
  if (!Buffer.isBuffer(frame) || frame.length === 0) throw new Error('frame must be a non-empty Buffer');
  if (mode !== 'news' && mode !== 'photo') throw new Error('mode must be "news" or "photo"');

  var snapshotId = 'snap_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  var createdAt = new Date().toISOString();
  var frameSha256 = computeFrameSha256(frame);
  var frameLength = frame.length;
  var contentHash = computeContentHash(frameId, payload, mode);

  return Object.freeze({
    snapshotId: snapshotId,
    frameId: frameId,
    payload: payload,
    frame: frame,
    mode: mode,
    frameSha256: frameSha256,
    frameLength: frameLength,
    contentHash: contentHash,
    createdAt: createdAt,
    schemaVersion: SCHEMA_VERSION,
  });
}

function serializeMeta(snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    frameId: snapshot.frameId,
    payload: snapshot.payload,
    mode: snapshot.mode,
    frameSha256: snapshot.frameSha256,
    frameLength: snapshot.frameLength,
    contentHash: snapshot.contentHash,
    createdAt: snapshot.createdAt,
    schemaVersion: snapshot.schemaVersion,
  };
}

module.exports = {
  createSnapshot: createSnapshot,
  serializeMeta: serializeMeta,
  SCHEMA_VERSION: SCHEMA_VERSION,
  ERR_INTEGRITY: ERR_INTEGRITY,
  SnapshotIntegrityError: SnapshotIntegrityError,
  computeFrameSha256: computeFrameSha256,
};
