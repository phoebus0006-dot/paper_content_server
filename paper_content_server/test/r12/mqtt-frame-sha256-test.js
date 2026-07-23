#!/usr/bin/env node
// r12-mqtt-frame-sha256-test.js — Host-side tests for EPF1 full-frame SHA256 contract and boundary integrity
// Imports real production modules (epf1-contract, snapshot-model) and tests exact contract rules.

var assert = require('assert');
var path = require('path');
var crypto = require('crypto');
var fs = require('fs');

var epf1Contract = require('../../src/publication/epf1-contract');
var snapshotModel = require('../../src/snapshot/snapshot-model');

var fixtureDir = path.join(__dirname, '..', 'fixtures', 'epf1');

var validFramePath = path.join(fixtureDir, 'valid-frame.epf1');
var validMetaPath = path.join(fixtureDir, 'valid-frame.metadata.json');
var invalidMagicPath = path.join(fixtureDir, 'invalid-magic.epf1');
var truncatedPath = path.join(fixtureDir, 'truncated-frame.epf1');
var wrongLengthPath = path.join(fixtureDir, 'wrong-length.epf1');

var validFrame = fs.readFileSync(validFramePath);
var validMeta = JSON.parse(fs.readFileSync(validMetaPath, 'utf8'));
var invalidMagicFrame = fs.readFileSync(invalidMagicPath);
var truncatedFrame = fs.readFileSync(truncatedPath);
var wrongLengthFrame = fs.readFileSync(wrongLengthPath);

// 1. Full-frame SHA256 contract validation
var computedFullSha = epf1Contract.computeEpf1FrameSha256(validFrame);
assert.strictEqual(computedFullSha, validMeta.sha256, 'Full-frame SHA256 must match golden fixture metadata SHA256');

// 2. Payload-only SHA256 must NOT equal full-frame SHA256
var payloadSha = crypto.createHash('sha256').update(validFrame.slice(10)).digest('hex');
assert.notStrictEqual(payloadSha, computedFullSha, 'Payload-only SHA256 must NOT equal full-frame SHA256');

// 3. EPF1 contract validation checks
var validValidation = epf1Contract.validateEpf1Frame(validFrame);
assert.strictEqual(validValidation.ok, true, 'Valid EPF1 frame validation must pass');

var invalidMagicValidation = epf1Contract.validateEpf1Frame(invalidMagicFrame);
assert.strictEqual(invalidMagicValidation.ok, false, 'Invalid magic frame must fail validation');

var truncatedValidation = epf1Contract.validateEpf1Frame(truncatedFrame);
assert.strictEqual(truncatedValidation.ok, false, 'Truncated frame must fail validation');

var wrongLengthValidation = epf1Contract.validateEpf1Frame(wrongLengthFrame);
assert.strictEqual(wrongLengthValidation.ok, false, 'Wrong length frame must fail validation');

// 4. Invalid version check
var invalidVersionFrame = Buffer.from(validFrame);
invalidVersionFrame.writeUInt8(2, 9); // version = 2
var invalidVersionValidation = epf1Contract.validateEpf1Frame(invalidVersionFrame);
assert.strictEqual(invalidVersionValidation.ok, false, 'Frame with version != 1 must fail validation');

// 5. Snapshot boundary enforcement check
assert.throws(function() {
  snapshotModel.createSnapshot(
    'photo:invalid-magic',
    { frameId: 'photo:invalid-magic', mode: 'photo' },
    invalidMagicFrame,
    'photo'
  );
}, function(err) {
  return err instanceof snapshotModel.SnapshotIntegrityError && /invalid EPF1 frame/.test(err.message);
}, 'createSnapshot must reject invalid EPF1 magic frame');

assert.throws(function() {
  snapshotModel.createSnapshot(
    'photo:truncated',
    { frameId: 'photo:truncated', mode: 'photo' },
    truncatedFrame,
    'photo'
  );
}, function(err) {
  return err instanceof snapshotModel.SnapshotIntegrityError && /invalid EPF1 frame/.test(err.message);
}, 'createSnapshot must reject truncated EPF1 frame');

// 6. Valid snapshot creation must use full-frame SHA256
var validSnapshot = snapshotModel.createSnapshot(
  'photo:valid',
  { frameId: 'photo:valid', mode: 'photo' },
  validFrame,
  'photo'
);
assert.strictEqual(validSnapshot.frameSha256, validMeta.sha256, 'Snapshot frameSha256 must use full-frame SHA256');

console.log('ALL R12 EPF1 CONTRACT & SHA BOUNDARY TESTS PASSED SUCCESSFULLY.');
