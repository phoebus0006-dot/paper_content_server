#!/usr/bin/env node
// mqtt-pending-lifecycle-test.js — Tests MQTT pending state retention & timer wrap-safety (R2-04, R2-08)

var assert = require('assert');

// Test wrap-safe timer comparison helper semantics (matching C++ isTimeReached)
function isTimeReached(now, deadline) {
  var diff = (now - deadline) | 0; // cast to 32-bit signed integer
  return diff >= 0;
}

// 1. Normal deadline checks
assert.strictEqual(isTimeReached(1000, 500), true, 'Deadline in past must return true');
assert.strictEqual(isTimeReached(500, 500), true, 'Deadline at exact time must return true');
assert.strictEqual(isTimeReached(499, 500), false, 'Deadline in future must return false');

// 2. Wrap-around boundary checks (millis uint32 overflow at 0xFFFFFFFF)
var nearMax = 0xFFFFFFF0; // 4294967280
var afterWrap = 0x00000010; // 16 (after uint32 overflow)
var deadlineAfterWrap = (nearMax + 30) >>> 0; // 26 (0x0000001A)

assert.strictEqual(isTimeReached(nearMax, deadlineAfterWrap), false, 'Before wrap: deadline not reached');
assert.strictEqual(isTimeReached(afterWrap, deadlineAfterWrap), false, 'After wrap: 16 is before deadline 26');
assert.strictEqual(isTimeReached(30, deadlineAfterWrap), true, 'After wrap: 30 is past deadline 26');

// 3. Pending notification state retention simulator (matching NewsPhoto_esp32wf.ino)
function MqttStateSimulator() {
  this.publicationPending = false;
  this.pendingFrameId = '';
  this.pendingSnapshotId = '';
  this.pendingFrameSha256 = '';
  this.mqttRetryMs = 0;
  this.lastFrameId = '';
}

MqttStateSimulator.prototype.receiveNotification = function(frameId, snapshotId, sha256) {
  this.pendingFrameId = frameId;
  this.pendingSnapshotId = snapshotId;
  this.pendingFrameSha256 = sha256;
  this.publicationPending = true;
};

MqttStateSimulator.prototype.clearPending = function() {
  this.publicationPending = false;
  this.pendingFrameId = '';
  this.pendingSnapshotId = '';
  this.pendingFrameSha256 = '';
};

MqttStateSimulator.prototype.handleNotification = function(nowMs, wifiOk, stateOk, serverState) {
  if (!this.publicationPending) return 'NO_PENDING';
  if (!isTimeReached(nowMs, this.mqttRetryMs)) return 'WAIT_RETRY_DEADLINE';

  if (!this.pendingFrameId || this.pendingFrameId === this.lastFrameId) {
    this.clearPending();
    return 'CLEARED_ALREADY_RENDERED';
  }

  if (!wifiOk) {
    this.mqttRetryMs = nowMs + 5000;
    return 'RETAINED_WIFI_FAILURE';
  }

  if (!stateOk) {
    this.mqttRetryMs = nowMs + 5000;
    return 'RETAINED_STATE_FAILURE';
  }

  if (serverState.frameId !== this.pendingFrameId) {
    this.clearPending();
    return 'CLEARED_STALE_FRAME';
  }

  if (serverState.frameSha256 !== this.pendingFrameSha256) {
    this.clearPending();
    return 'CLEARED_SHA_MISMATCH';
  }

  this.lastFrameId = serverState.frameId;
  this.clearPending();
  return 'SUCCESS_RENDERED';
};

var sim = new MqttStateSimulator();
sim.receiveNotification('frame-100', 'snap-100', 'a'.repeat(64));
assert.strictEqual(sim.publicationPending, true);

// Case A: WiFi temporary failure -> RETAIN pending, set 5s retry
var res1 = sim.handleNotification(1000, false, true, null);
assert.strictEqual(res1, 'RETAINED_WIFI_FAILURE');
assert.strictEqual(sim.publicationPending, true, 'Pending must be retained on WiFi failure');
assert.strictEqual(sim.pendingFrameId, 'frame-100');

// Case B: Attempt before retry deadline -> WAIT
var res2 = sim.handleNotification(3000, true, true, null);
assert.strictEqual(res2, 'WAIT_RETRY_DEADLINE');
assert.strictEqual(sim.publicationPending, true);

// Case C: Attempt after retry deadline with state fetch failure -> RETAIN
var res3 = sim.handleNotification(6000, true, false, null);
assert.strictEqual(res3, 'RETAINED_STATE_FAILURE');
assert.strictEqual(sim.publicationPending, true);

// Case D: Successful fetch & render -> CLEAR pending
var res4 = sim.handleNotification(12000, true, true, { frameId: 'frame-100', frameSha256: 'a'.repeat(64) });
assert.strictEqual(res4, 'SUCCESS_RENDERED');
assert.strictEqual(sim.publicationPending, false, 'Pending must be cleared on success');
assert.strictEqual(sim.pendingFrameId, '', 'All pending fields must be cleared');
assert.strictEqual(sim.lastFrameId, 'frame-100');

console.log('ALL MQTT PENDING LIFECYCLE TESTS PASSED.');
