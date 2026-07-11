// mqtt-message.js — Publication message schema (no frame bytes)
var SCHEMA_VERSION = 1;
function createPublicationMessage(deviceId, snapshotId, frameId, frameSha256) {
  return { schemaVersion: SCHEMA_VERSION, deviceId: deviceId, snapshotId: snapshotId, frameId: frameId, frameSha256: frameSha256, publishedAt: new Date().toISOString() };
}
function validateMessage(msg) {
  if (!msg || msg.schemaVersion !== SCHEMA_VERSION) return false;
  if (!msg.snapshotId || !msg.frameId) return false;
  return true;
}
module.exports = { createPublicationMessage: createPublicationMessage, validateMessage: validateMessage, SCHEMA_VERSION: SCHEMA_VERSION };
