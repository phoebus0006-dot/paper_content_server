// mqtt-message.js — Publication message schema (no frame bytes)
var SCHEMA_VERSION = 2;
var VALID_REASONS = ['manual_publish', 'manual_news', 'manual_photo', 'one_shot', 'focus_change', 'scheduled_boundary', 'rollback', 'schedule', 'schedule_restore'];

function createPublicationMessage(deviceId, snapshotId, frameId, frameSha256, reason) {
  var msg = {
    schemaVersion: SCHEMA_VERSION,
    deviceId: deviceId,
    snapshotId: snapshotId,
    frameId: frameId,
    frameSha256: frameSha256,
    publishedAt: new Date().toISOString(),
  };
  if (reason && VALID_REASONS.indexOf(reason) >= 0) {
    msg.reason = reason;
  }
  return msg;
}
function validateMessage(msg) {
  if (!msg) return false;
  if (msg.schemaVersion !== 1 && msg.schemaVersion !== SCHEMA_VERSION) return false;
  if (!msg.snapshotId || !msg.frameId) return false;
  // v2+ may carry reason; v1 has no reason field
  if (msg.schemaVersion >= 2 && msg.reason !== undefined && VALID_REASONS.indexOf(msg.reason) < 0) return false;
  return true;
}
module.exports = {
  createPublicationMessage: createPublicationMessage,
  validateMessage: validateMessage,
  SCHEMA_VERSION: SCHEMA_VERSION,
  VALID_REASONS: VALID_REASONS,
};
