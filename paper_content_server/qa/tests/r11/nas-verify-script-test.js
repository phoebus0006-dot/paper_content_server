#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var verifyPath = path.join(ROOT, 'deploy', 'nas', 'verify.sh');
t('VERIFY_SCRIPT_EXISTS', fs.existsSync(verifyPath), '');

var content = fs.readFileSync(verifyPath, 'utf8');

t('VERIFY_USES_VALIDATOR', content.indexOf('validate-frame.js') >= 0, '');
t('VERIFY_HEALTH_LIVE', content.indexOf('/health/live') >= 0, '');
t('VERIFY_HEALTH_READY', content.indexOf('/health/ready') >= 0, '');
t('VERIFY_FRAME_DOWNLOAD', content.indexOf('/api/frame.bin') >= 0, '');
t('VERIFY_FRAME_LENGTH', content.indexOf('192010') >= 0, '');
t('VERIFY_CONTAINER_NONROOT', content.indexOf('id -u') >= 0, '');
t('VERIFY_NO_DIRECT_CODE4', content.indexOf('xxd') < 0 && content.indexOf('byte 9') < 0, 'no direct byte access for code4');

// Check VALIDATOR_EXIT is preserved (not || true'd)
t('VALIDATOR_EXIT_PRESERVED', content.indexOf('VALIDATE_EXIT=$?') >= 0 && content.indexOf('|| true') < 0, '');

// Check that set +e is used around validator call
t('VALIDATOR_SETE_USED', content.indexOf('set +e') >= 0, '');
// The restore set -e must be after set +e (not counting the initial set -euo pipefail)
var primeiro = content.indexOf('set -e');
var segundo = content.indexOf('set -e', primeiro + 1);
t('VALIDATOR_SETE_RESTORED', segundo > 0 && segundo > content.indexOf('set +e'), 'first at ' + primeiro + ' second at ' + segundo);

// Test valid frame -> validator exit 0
var frame = Buffer.alloc(192010, 0x11);
frame.write('EPF1', 0, 4, 'ascii');
frame.writeUInt16LE(800, 4);
frame.writeUInt16LE(480, 6);
frame.writeUInt8(49, 8);
frame.writeUInt8(1, 9);
var tmpValid = path.join(require('os').tmpdir(), 'r11_verify_' + Date.now() + '.bin');
fs.writeFileSync(tmpValid, frame);
var validResult = cp.spawnSync(process.execPath, [
  path.join(ROOT, 'scripts', 'validate-frame.js'), tmpValid
], { cwd: ROOT });
t('VALID_FRAME_VERIFY_EXIT_ZERO', validResult.status === 0, 'exit=' + validResult.status);
try { fs.unlinkSync(tmpValid); } catch(e) {}

// Test invalid frame -> validator exit 1
var badFrame = Buffer.alloc(192010, 0x44);
badFrame.write('EPF1', 0, 4, 'ascii');
badFrame.writeUInt16LE(800, 4);
badFrame.writeUInt16LE(480, 6);
badFrame.writeUInt8(49, 8);
badFrame.writeUInt8(1, 9);
var tmpBad = path.join(require('os').tmpdir(), 'r11_verify_bad_' + Date.now() + '.bin');
fs.writeFileSync(tmpBad, badFrame);
var badResult = cp.spawnSync(process.execPath, [
  path.join(ROOT, 'scripts', 'validate-frame.js'), tmpBad
], { cwd: ROOT });
t('INVALID_FRAME_VERIFY_EXIT_ONE', badResult.status !== 0, 'exit=' + badResult.status);
t('VALIDATOR_NONZERO_PROPAGATED', badResult.status !== 0, '');
try { fs.unlinkSync(tmpBad); } catch(e) {}

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
