#!/usr/bin/env node
// R2.6: EPF1 encoder extraction parity test

var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var epf1 = require(path.join(ROOT, 'src', 'epaper', 'epf1'));
var C = epf1.EPF1_CONSTANTS;

// 1. Constants
t('MAGIC', C.MAGIC === 'EPF1', '');
t('WIDTH', C.WIDTH === 800, '');
t('HEIGHT', C.HEIGHT === 480, '');
t('PANEL', C.PANEL === 49, '');
t('VERSION', C.VERSION === 1, '');
t('HEADER_BYTES', C.HEADER_BYTES === 10, '');
t('PAYLOAD_BYTES', C.PAYLOAD_BYTES === 192000, 'got ' + C.PAYLOAD_BYTES);
t('TOTAL_BYTES', C.TOTAL_BYTES === 192010, 'got ' + C.TOTAL_BYTES);

// 2. packPixels
t('PACK_BLACK_WHITE', epf1.packPixels(0, 1) === 0x01, 'got 0x' + epf1.packPixels(0,1).toString(16));
t('PACK_RED_BLUE', epf1.packPixels(3, 5) === 0x35, 'got 0x' + epf1.packPixels(3,5).toString(16));
t('PACK_WHITE_BLACK', epf1.packPixels(1, 0) === 0x10, 'got 0x' + epf1.packPixels(1,0).toString(16));

// 3. packPixels rejects invalid codes
var rejectOk = false;
try { epf1.packPixels(4, 1); } catch(e) { rejectOk = true; }
t('PACK_REJECT_CODE4', rejectOk, '');

// 4. buildHeader
var header = epf1.buildHeader();
t('HEADER_LEN', header.length === 10, 'got ' + header.length);
t('HEADER_MAGIC', header.slice(0,4).toString('ascii') === 'EPF1', '');
t('HEADER_WIDTH', header.readUInt16LE(4) === 800, '');
t('HEADER_HEIGHT', header.readUInt16LE(6) === 480, '');
t('HEADER_PANEL', header.readUInt8(8) === 49, '');
t('HEADER_VERSION', header.readUInt8(9) === 1, '');

// 5. encodePayload — all white
var allWhite = new Array(800*480);
for (var i = 0; i < allWhite.length; i++) allWhite[i] = 1;
var payload = epf1.encodePayload(allWhite);
t('PAYLOAD_LEN', payload.length === 192000, 'got ' + payload.length);
// Every byte should be 0x11 (left=1, right=1)
var all11 = true;
for (var j = 0; j < 100; j++) { if (payload[j] !== 0x11) { all11 = false; break; } }
t('PAYLOAD_ALL_WHITE', all11, 'first byte 0x' + payload[0].toString(16));

// 6. encodePayload — alt black/white (0,1,0,1,...)
var altBW = new Array(800*480);
for (var k = 0; k < altBW.length; k++) altBW[k] = k % 2;
var payload2 = epf1.encodePayload(altBW);
var expectedByte = (0 << 4) | 1; // 0x01
t('PAYLOAD_ALT_BW', payload2[0] === expectedByte, 'got 0x' + payload2[0].toString(16) + ' expected 0x' + expectedByte.toString(16));

// 7. encodePayload — invalid code rejection
var badCodes = new Array(800*480);
badCodes.fill(1);
badCodes[100] = 4;
var badOk = false;
try { epf1.encodePayload(badCodes); } catch(e) { badOk = true; }
t('PAYLOAD_REJECT_CODE4', badOk, '');

// 8. encodePayload — wrong length rejection
var shortCodes = [1, 1, 1];
var shortOk = false;
try { epf1.encodePayload(shortCodes); } catch(e) { shortOk = true; }
t('PAYLOAD_REJECT_SHORT', shortOk, '');

// 9. encodeFrame — full frame (all white)
var frame = epf1.encodeFrame(allWhite);
t('FRAME_LEN', frame.length === 192010, 'got ' + frame.length);
t('FRAME_MAGIC', frame.slice(0,4).toString('ascii') === 'EPF1', '');
t('FRAME_PAYLOAD_WHITE', frame[10] === 0x11, 'first payload byte 0x' + frame[10].toString(16));

// 10. hexPreview
t('HEX_PREVIEW', epf1.hexPreview(Buffer.from([0x01, 0x23, 0x45])) === '01 23 45', 'got "' + epf1.hexPreview(Buffer.from([0x01, 0x23, 0x45])) + '"');
t('HEX_PREVIEW_TRUNC', epf1.hexPreview(Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89]), 3) === '01 23 45', '');

// 11. Verify nibble encoding: high=left, low=right
var testCodes = new Array(800*480);
for (var m = 0; m < testCodes.length; m++) testCodes[m] = 1;
testCodes[0] = 5; testCodes[1] = 6; // first pair: left=blue(5), right=green(6) → 0x56
var frame2 = epf1.encodeFrame(testCodes);
t('NIBBLE_LEFT_RIGHT', frame2[10] === 0x56, 'got 0x' + frame2[10].toString(16));

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
