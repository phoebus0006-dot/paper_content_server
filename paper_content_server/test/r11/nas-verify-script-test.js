#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
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

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
