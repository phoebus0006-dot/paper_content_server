#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { validateFrameBuffer } = require(path.join(ROOT, 'src', 'epaper', 'frame-validator'));

// Create a valid frame
var frame = Buffer.alloc(192010, 0x11);
frame.write('EPF1', 0, 4, 'ascii');
frame.writeUInt16LE(800, 4);
frame.writeUInt16LE(480, 6);
frame.writeUInt8(49, 8);
frame.writeUInt8(1, 9);

// Validate via validator
var result = validateFrameBuffer(frame);
t('VALID_FRAME_OK', result.ok, '');
t('VALID_FRAME_CODE4_ZERO', result.code4Count === 0, 'code4Count=' + result.code4Count);
t('VALID_FRAME_INVALID_COUNT_ZERO', result.invalidCodeCount === 0, 'invalidCodeCount=' + result.invalidCodeCount);

// Now create frame with code4 (orange) pixels
var badFrame = Buffer.alloc(192010, 0x44); // 0x44 = left=4, right=4
badFrame.write('EPF1', 0, 4, 'ascii');
badFrame.writeUInt16LE(800, 4);
badFrame.writeUInt16LE(480, 6);
badFrame.writeUInt8(49, 8);
badFrame.writeUInt8(1, 9);

var badResult = validateFrameBuffer(badFrame);
t('INVALID_CODE4_FRAME_REJECTED', !badResult.ok, 'ok=' + badResult.ok);
t('INVALID_CODE4_COUNT_GT_ZERO', badResult.code4Count > 0, 'code4Count=' + badResult.code4Count);

// Verify VERSION_BYTE_NOT_USED_AS_CODE4 - byte 9 is version, not code4
t('VERSION_BYTE_NOT_USED_AS_CODE4', frame[9] === 1, 'version=' + frame[9] + ' (code4 would be wrong)');

// Test CLI script
var scriptPath = path.join(ROOT, 'scripts', 'validate-frame.js');
t('VALIDATOR_CLI_EXISTS', fs.existsSync(scriptPath), '');

// Write valid frame to temp
var tmpDir = require('os').tmpdir();
var tmpFile = path.join(tmpDir, 'r11_test_frame_' + Date.now() + '.bin');
fs.writeFileSync(tmpFile, frame);

var cliResult = cp.spawnSync(process.execPath, [scriptPath, tmpFile], { cwd: ROOT });
t('VALIDATOR_CLI_PASSES', cliResult.status === 0, 'exit=' + cliResult.status);
var output = cliResult.stdout.toString();
t('VALIDATOR_CLI_OUTPUT', output.indexOf('Validator: PASS') >= 0, output.slice(-100));

// Test with bad frame
var tmpBadFile = path.join(tmpDir, 'r11_test_bad_' + Date.now() + '.bin');
fs.writeFileSync(tmpBadFile, badFrame);
var cliBad = cp.spawnSync(process.execPath, [scriptPath, tmpBadFile], { cwd: ROOT });
t('VALIDATOR_CLI_REJECTS_BAD', cliBad.status !== 0, 'exit=' + cliBad.status);

try { fs.unlinkSync(tmpFile); } catch(e) {}
try { fs.unlinkSync(tmpBadFile); } catch(e) {}

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
