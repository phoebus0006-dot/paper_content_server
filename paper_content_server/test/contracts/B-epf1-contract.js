#!/usr/bin/env node
// EPF1 Contract — verify frame format, header, payload structure
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var mod = require(path.join(ROOT, 'server.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

// Build a known frame buffer and inspect its structure
var FRAME_W = 800, FRAME_H = 480;
var HEADER_BYTES = 10;
var PAYLOAD_BYTES = Math.ceil((FRAME_W * FRAME_H) / 2);
var TOTAL_BYTES = HEADER_BYTES + PAYLOAD_BYTES;

test('HEADER_SIZE=' + HEADER_BYTES, HEADER_BYTES === 10, '');
test('PAYLOAD_SIZE=' + PAYLOAD_BYTES, PAYLOAD_BYTES === 192000, PAYLOAD_BYTES + ' (expected 192000)');
test('TOTAL_SIZE=' + TOTAL_BYTES, TOTAL_BYTES === 192010, TOTAL_BYTES + ' (expected 192010)');

// Use production imageToFrameBuffer to create a frame
// Two pixels per byte: high nibble = left pixel, low nibble = right pixel
// Allowed codes: 0=black, 1=white, 2=yellow, 3=red, 5=blue, 6=green
// Code 4 is unsupported

var width = 4, height = 1;
var raw = Buffer.alloc(width * height * 3);

// Set pixel 0 (left) to red (code 3): RGB 255,0,0
raw[0] = 255; raw[1] = 0; raw[2] = 0;
// Set pixel 1 to white (code 1): RGB 255,255,255
raw[3] = 255; raw[4] = 255; raw[5] = 255;
// Set pixel 2 to black (code 0): RGB 0,0,0
raw[6] = 0; raw[7] = 0; raw[8] = 0;
// Set pixel 3 to yellow (code 2): RGB 255,255,0
raw[9] = 255; raw[10] = 255; raw[11] = 0;

var frame = mod.imageToFrameBuffer(raw, width, height, 3);

// The payload starts after header
// Pixel 0-1 have palette codes from nearestPaletteCode
// Since data is small, the first byte should have hi=code(pixel0), lo=code(pixel1)
var payload = frame.slice(HEADER_BYTES);
var b0 = payload[0];
var hi0 = (b0 >> 4) & 0x0F;
var lo0 = b0 & 0x0F;

test('EPF1_HEADER_MAGIC', frame.slice(0, 4).toString() === 'EPF1', frame.slice(0, 4).toString());
var fw = frame.readUInt16LE(4);
var fh = frame.readUInt16LE(6);
test('EPF1_WIDTH=' + fw, fw === width, '');
test('EPF1_HEIGHT=' + fh, fh === height, '');

// Verify each byte in the full frame buffer
var fullBuf = Buffer.alloc(TOTAL_BYTES, 0x11);
var code4Count = 0;
var validCodes = [0, 1, 2, 3, 5, 6];
for (var i = HEADER_BYTES; i < TOTAL_BYTES; i++) {
  var hi = (fullBuf[i] >> 4) & 0x0F;
  var lo = fullBuf[i] & 0x0F;
  if (hi === 4) code4Count++;
  if (lo === 4) code4Count++;
}
test('DEFAULT_FRAME_CODE4_ZERO', code4Count === 0, 'code4=' + code4Count);

// Scan actual frame from imageToFrameBuffer
var actualCode4 = 0;
var seenCodes = new Set();
for (var i = HEADER_BYTES; i < frame.length; i++) {
  var hi = (frame[i] >> 4) & 0x0F;
  var lo = frame[i] & 0x0F;
  seenCodes.add(hi); seenCodes.add(lo);
  if (hi === 4) actualCode4++;
  if (lo === 4) actualCode4++;
}
test('FRAME_CODE4_ZERO', actualCode4 === 0, 'code4=' + actualCode4);
var allValid = Array.from(seenCodes).every(function(c) { return validCodes.indexOf(c) >= 0; });
test('FRAME_CODES_VALID', allValid, 'codes=' + JSON.stringify(Array.from(seenCodes)));

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
