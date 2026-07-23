#!/usr/bin/env node
// epf1-validator-safety-test.js — Tests EPF1 validator robustness on untrusted inputs (R2-01, R2-08)
// Ensures no invalid input (null, short Buffer, wrong length, bad header) throws RangeError or uncaught exceptions.

var assert = require('assert');
var epf1Contract = require('../../src/publication/epf1-contract');
var frameValidator = require('../../src/epaper/frame-validator');

var nonBuffers = [
  null,
  undefined,
  'invalid string',
  12345,
  { magic: 'EPF1' },
  [1, 2, 3],
  true,
];

nonBuffers.forEach(function(val) {
  var res1 = epf1Contract.validateEpf1Frame(val);
  assert.strictEqual(res1.ok, false, 'Non-buffer must return ok: false');
  assert.strictEqual(Array.isArray(res1.errors), true, 'errors must be array');

  var res2 = frameValidator.validateFrameBuffer(val);
  assert.strictEqual(res2.ok, false, 'Wrapper must return ok: false');
});

var shortLengths = [0, 1, 4, 8, 9, 10, 100, 192009, 192011];
shortLengths.forEach(function(len) {
  var buf = Buffer.alloc(len, 0x11);
  if (len >= 4) buf.write('EPF1', 0, 4, 'ascii');
  if (len >= 6) buf.writeUInt16LE(800, 4);
  if (len >= 8) buf.writeUInt16LE(480, 6);
  if (len >= 9) buf.writeUInt8(49, 8);
  if (len >= 10) buf.writeUInt8(1, 9);

  var res = epf1Contract.validateEpf1Frame(buf);
  assert.strictEqual(res.ok, false, 'Length ' + len + ' must return ok: false');
  assert.strictEqual(Array.isArray(res.errors), true, 'errors must be array');
  assert.strictEqual(res.errors.length > 0, true, 'errors must contain messages');
});

// Construct exact valid 192010-byte EPF1 frame
var validFrame = Buffer.alloc(192010, 0x11);
validFrame.write('EPF1', 0, 4, 'ascii');
validFrame.writeUInt16LE(800, 4);
validFrame.writeUInt16LE(480, 6);
validFrame.writeUInt8(49, 8);
validFrame.writeUInt8(1, 9);

var validRes = epf1Contract.validateEpf1Frame(validFrame);
assert.strictEqual(validRes.ok, true, 'Valid 192010 frame must return ok: true');
assert.strictEqual(validRes.header.magic, 'EPF1');
assert.strictEqual(validRes.header.width, 800);
assert.strictEqual(validRes.header.height, 480);
assert.strictEqual(validRes.header.panel, 49);
assert.strictEqual(validRes.header.version, 1);

// Test Header Bad Values
var badMagic = Buffer.from(validFrame);
badMagic.write('XXXX', 0, 4, 'ascii');
assert.strictEqual(epf1Contract.validateEpf1Frame(badMagic).ok, false, 'Bad magic must fail');

var badWidth = Buffer.from(validFrame);
badWidth.writeUInt16LE(1024, 4);
assert.strictEqual(epf1Contract.validateEpf1Frame(badWidth).ok, false, 'Bad width must fail');

var badHeight = Buffer.from(validFrame);
badHeight.writeUInt16LE(600, 6);
assert.strictEqual(epf1Contract.validateEpf1Frame(badHeight).ok, false, 'Bad height must fail');

var badPanel = Buffer.from(validFrame);
badPanel.writeUInt8(50, 8);
assert.strictEqual(epf1Contract.validateEpf1Frame(badPanel).ok, false, 'Bad panel must fail');

var badVersion = Buffer.from(validFrame);
badVersion.writeUInt8(2, 9);
assert.strictEqual(epf1Contract.validateEpf1Frame(badVersion).ok, false, 'Bad version must fail');

console.log('ALL EPF1 VALIDATOR SAFETY TESTS PASSED.');
