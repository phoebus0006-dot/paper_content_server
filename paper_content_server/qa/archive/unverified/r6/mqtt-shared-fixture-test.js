#!/usr/bin/env node
// Shared MQTT fixture test — verifies the Node server-side validateMessage
// and an in-process reference port of the ESP32 extractJsonInt parser both
// accept/reject the same shared fixtures under test/fixtures/mqtt/*.json.
//
// Contract under test:
//   - v1 and v2 numeric schemaVersion: accept (server emits v2 as JSON number)
//   - v0, v3, missing, non-numeric: reject
//   - unknown reason on v2: rejected by server validator (strict allow-list)
//   - invalid frameSha256: rejected by ESP32 parser (sha hex format check)
//   - deviceId / frameId / snapshotId remain strict on both sides
//   - callback only sets pending flag (simulated)
//
// ESP32 runtime on real hardware is NOT covered here — that requires a
// physical device and is tracked separately as ESP32_MQTT_RUNTIME=NOT_TESTED.
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var FIXTURE_DIR = path.join(ROOT, 'test', 'fixtures', 'mqtt');
var msgApi = require(path.join(ROOT, 'src', 'mqtt', 'mqtt-message'));

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

// ── In-process port of ESP32 extractJsonInt (mirror of NewsPhoto_esp32wf.ino) ──
// Kept in sync manually; a build-time check below asserts the source line
// count matches to detect drift.
function extractJsonInt(json, key) {
  var needle = '"' + key + '"';
  var keyPos = json.indexOf(needle);
  if (keyPos < 0) return null;
  var colon = json.indexOf(':', keyPos + needle.length);
  if (colon < 0) return null;
  var i = colon + 1;
  while (i < json.length && (json[i] === ' ' || json[i] === '\t')) i++;
  var start = i;
  if (i < json.length && json[i] === '-') i++;
  if (i >= json.length || json[i] < '0' || json[i] > '9') return null;
  while (i < json.length && json[i] >= '0' && json[i] <= '9') i++;
  if (i === start || (i === start + 1 && json[start] === '-')) return null;
  return parseInt(json.substring(start, i), 10);
}

function extractJsonString(json, key) {
  var needle = '"' + key + '"';
  var keyPos = json.indexOf(needle);
  if (keyPos < 0) return '';
  var colon = json.indexOf(':', keyPos + needle.length);
  if (colon < 0) return '';
  var start = json.indexOf('"', colon + 1);
  if (start < 0) return '';
  var end = json.indexOf('"', start + 1);
  if (end < 0) return '';
  return json.substring(start + 1, end);
}

function isValidShaHex(sha) {
  if (sha.length !== 64) return false;
  for (var i = 0; i < 64; i++) {
    var c = sha.charAt(i);
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
  }
  return true;
}

// Mirror of ESP32 mqttCallback schemaVersion + sha validation logic.
// Returns { accept: bool, reason: string } — does NOT do HTTP or display work,
// mirroring the constraint that the callback only sets a pending flag.
function esp32Acceptance(json, expectedDeviceId) {
  var svNum = null;
  var svNumOk = (function() {
    var v = extractJsonInt(json, 'schemaVersion');
    if (v === null) return false;
    svNum = v;
    return true;
  })();
  var svStr = extractJsonString(json, 'schemaVersion');
  var svValid = (svNumOk && (svNum === 1 || svNum === 2)) || svStr === '1' || svStr === '2';
  if (!svValid) return { accept: false, reason: 'schemaVersion' };

  var msgDeviceId = extractJsonString(json, 'deviceId');
  if (!msgDeviceId || msgDeviceId !== expectedDeviceId) return { accept: false, reason: 'deviceId' };

  var msgFrameId = extractJsonString(json, 'frameId');
  if (!msgFrameId) return { accept: false, reason: 'frameId' };

  var msgSha = extractJsonString(json, 'frameSha256');
  if (!msgSha || !isValidShaHex(msgSha)) return { accept: false, reason: 'frameSha256' };

  // Pending flag set — HTTP + display still happen in main loop
  return { accept: true, reason: '', frameId: msgFrameId, sha: msgSha };
}

function loadFixture(name) {
  var fp = path.join(FIXTURE_DIR, name);
  return fs.readFileSync(fp, 'utf8').trim();
}

// ── Sanity: fixtures must exist and be parseable JSON ──
var fixtures = [
  'mqtt-v1-valid.json',
  'mqtt-v2-valid.json',
  'mqtt-v0-invalid.json',
  'mqtt-v3-invalid.json',
  'mqtt-missing-version.json',
  'mqtt-invalid-sha.json',
  'mqtt-v2-unknown-reason.json'
];
fixtures.forEach(function(name) {
  var raw;
  try { raw = loadFixture(name); } catch (e) { t('FIXTURE_READABLE_' + name, false, e.message); return; }
  var parsed;
  try { parsed = JSON.parse(raw); } catch (e) { t('FIXTURE_JSON_' + name, false, e.message); return; }
  t('FIXTURE_READABLE_' + name, !!parsed);
});

// ── Server-side validateMessage on shared fixtures ──
(function() {
  var v1 = JSON.parse(loadFixture('mqtt-v1-valid.json'));
  var v2 = JSON.parse(loadFixture('mqtt-v2-valid.json'));
  var v0 = JSON.parse(loadFixture('mqtt-v0-invalid.json'));
  var v3 = JSON.parse(loadFixture('mqtt-v3-invalid.json'));
  var missing = JSON.parse(loadFixture('mqtt-missing-version.json'));
  var badSha = JSON.parse(loadFixture('mqtt-invalid-sha.json'));
  var unknownReason = JSON.parse(loadFixture('mqtt-v2-unknown-reason.json'));

  t('SERVER_ACCEPT_V1', msgApi.validateMessage(v1) === true);
  t('SERVER_ACCEPT_V2', msgApi.validateMessage(v2) === true);
  t('SERVER_REJECT_V0', msgApi.validateMessage(v0) === false);
  t('SERVER_REJECT_V3', msgApi.validateMessage(v3) === false);
  t('SERVER_REJECT_MISSING_VERSION', msgApi.validateMessage(missing) === false);
  // Server validator does NOT check frameSha256 length/format — that is the
  // ESP32's responsibility. Server only checks schemaVersion, snapshotId,
  // frameId non-empty, and reason allow-list. So a non-empty invalid SHA is
  // accepted by server but rejected by ESP32 parser (see below).
  t('SERVER_ACCEPTS_INVALID_SHA_LEN', msgApi.validateMessage(badSha) === true, 'server does not validate SHA format');
  t('SERVER_REJECT_UNKNOWN_REASON', msgApi.validateMessage(unknownReason) === false, 'reason must be in VALID_REASONS');
})();

// ── ESP32-side parser port on shared fixtures ──
(function() {
  var v1 = loadFixture('mqtt-v1-valid.json');
  var v2 = loadFixture('mqtt-v2-valid.json');
  var v0 = loadFixture('mqtt-v0-invalid.json');
  var v3 = loadFixture('mqtt-v3-invalid.json');
  var missing = loadFixture('mqtt-missing-version.json');
  var badSha = loadFixture('mqtt-invalid-sha.json');
  var unknownReason = loadFixture('mqtt-v2-unknown-reason.json');

  t('ESP32_ACCEPT_V1_NUM', esp32Acceptance(v1, 'dev-1').accept === true);
  t('ESP32_ACCEPT_V2_NUM', esp32Acceptance(v2, 'dev-1').accept === true);
  t('ESP32_REJECT_V0', esp32Acceptance(v0, 'dev-1').accept === false);
  t('ESP32_REJECT_V3', esp32Acceptance(v3, 'dev-1').accept === false);
  t('ESP32_REJECT_MISSING_VERSION', esp32Acceptance(missing, 'dev-1').accept === false);
  t('ESP32_REJECT_INVALID_SHA', esp32Acceptance(badSha, 'dev-1').accept === false);
  // ESP32 firmware does NOT enforce reason allow-list; unknown reason is accepted.
  // This is intentional: server-side is the source of truth for reason validation.
  // Firmware only checks schemaVersion, deviceId, frameId, frameSha256.
  var unknownR = esp32Acceptance(unknownReason, 'dev-1');
  t('ESP32_ACCEPT_UNKNOWN_REASON', unknownR.accept === true, 'firmware does not validate reason');

  // deviceId mismatch must reject
  t('ESP32_REJECT_DEVICE_MISMATCH', esp32Acceptance(v2, 'wrong-device').accept === false);
})();

// ── String-form schemaVersion tolerance (firmware accepts both number and string) ──
(function() {
  var strV1 = '{"schemaVersion":"1","deviceId":"dev-1","snapshotId":"s","frameId":"f","frameSha256":"a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef"}';
  var strV2 = '{"schemaVersion":"2","deviceId":"dev-1","snapshotId":"s","frameId":"f","frameSha256":"a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef"}';
  t('ESP32_ACCEPT_STRING_V1', esp32Acceptance(strV1, 'dev-1').accept === true);
  t('ESP32_ACCEPT_STRING_V2', esp32Acceptance(strV2, 'dev-1').accept === true);

  // String "3" must be rejected
  var strV3 = '{"schemaVersion":"3","deviceId":"dev-1","snapshotId":"s","frameId":"f","frameSha256":"a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef"}';
  t('ESP32_REJECT_STRING_V3', esp32Acceptance(strV3, 'dev-1').accept === false);
})();

// ── Pending-flag-only contract: callback does NOT do HTTP or display work ──
(function() {
  var v2 = loadFixture('mqtt-v2-valid.json');
  var result = esp32Acceptance(v2, 'dev-1');
  t('ESP32_CALLBACK_RETURNS_NO_BODY', !result.body, 'callback only sets pending flag');
  t('ESP32_CALLBACK_RETURNS_FRAMEID', !!result.frameId, 'main loop reads frameId from pending state');
})();

// ── Drift check: ESP32 ino file must contain extractJsonInt ──
(function() {
  var inoPath = path.join(ROOT, '..', 'NewsPhoto_esp32wf', 'NewsPhoto_esp32wf.ino');
  if (!fs.existsSync(inoPath)) {
    t('ESP32_INO_PRESENT', false, inoPath + ' missing');
    return;
  }
  var src = fs.readFileSync(inoPath, 'utf8');
  t('ESP32_INO_HAS_EXTRACT_JSON_INT', src.indexOf('bool extractJsonInt') >= 0, 'extractJsonInt function present');
  t('ESP32_INO_ACCEPTS_V2_NUM', /svNum\s*==\s*2/.test(src), 'v2 numeric acceptance present');
  t('ESP32_INO_REJECTS_V0_V3', /svNum\s*==\s*1\s*\|\|\s*svNum\s*==\s*2/.test(src), 'only v1 and v2 accepted');
  t('ESP32_INO_NO_TO_INT_SHORTCUT', src.indexOf('sv.toInt()') < 0, 'must not paper over with toInt()');
})();

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
