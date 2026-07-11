#!/usr/bin/env node
// R2.7: Frame validator test

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var epf1 = require(path.join(ROOT, 'src', 'epaper', 'epf1'));
var validator = require(path.join(ROOT, 'src', 'epaper', 'frame-validator'));

var C = epf1.EPF1_CONSTANTS;

// Build header
function buildHeader() {
  var h = Buffer.alloc(10);
  h.write('EPF1', 0, 4, 'ascii');
  h.writeUInt16LE(C.WIDTH, 4);
  h.writeUInt16LE(C.HEIGHT, 6);
  h.writeUInt8(C.PANEL, 8);
  h.writeUInt8(C.VERSION, 9);
  return h;
}

// Build a valid frame
var header = buildHeader();
var validPayload = Buffer.alloc(C.PAYLOAD_BYTES, 0x11);
var validFrame = Buffer.concat([header, validPayload]);

// 1. Valid frame passes
var r1 = validator.validateFrameBuffer(validFrame);
t('VALID_OK', r1.ok === true, '');
t('VALID_ERRORS_EMPTY', r1.errors.length === 0, '');
t('VALID_HEADER_MAGIC', r1.header.magic === 'EPF1', '');
t('VALID_CODE4_ZERO', r1.code4Count === 0, '');

// 2. Not a Buffer
var r2 = validator.validateFrameBuffer('not a buffer');
t('NOT_BUFFER', r2.ok === false && r2.errors.length > 0, '');

// 3. Wrong length (short)
var shortBuf = Buffer.alloc(100);
var r3 = validator.validateFrameBuffer(shortBuf);
t('SHORT', r3.ok === false && r3.errors.length > 0, '');

// 4. Bad magic
var badMagic = Buffer.from(validFrame);
badMagic[0] = 0x42;
var r4 = validator.validateFrameBuffer(badMagic);
t('BAD_MAGIC', r4.ok === false, '');

// 5. Bad width
var badW = Buffer.from(validFrame);
badW.writeUInt16LE(100, 4);
var r5 = validator.validateFrameBuffer(badW);
t('BAD_WIDTH', r5.ok === false, '');

// 6. Bad panel
var badP = Buffer.from(validFrame);
badP[8] = 99;
var r6 = validator.validateFrameBuffer(badP);
t('BAD_PANEL', r6.ok === false, '');

// 7. Invalid codes in payload (code 4) — build at byte level
var code4Payload = Buffer.alloc(C.PAYLOAD_BYTES, 0x11);
code4Payload[0] = 0x44; // nibbles: left=4, right=4
var code4Frame = Buffer.concat([header, code4Payload]);
var r7 = validator.validateFrameBuffer(code4Frame);
t('CODE4_DETECTED', r7.ok === false, '');
t('CODE4_COUNT', r7.code4Count === 2, 'got ' + r7.code4Count);

// 8. Invalid code 7
var code7Payload = Buffer.alloc(C.PAYLOAD_BYTES, 0x11);
code7Payload[0] = 0x77; // nibbles: left=7, right=7
var code7Frame = Buffer.concat([header, code7Payload]);
var r8 = validator.validateFrameBuffer(code7Frame);
t('CODE7_DETECTED', r8.ok === false && r8.invalidCodeCount === 2, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
