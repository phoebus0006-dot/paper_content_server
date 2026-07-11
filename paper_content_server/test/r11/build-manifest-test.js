#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

// Test that generate-build-manifest.js uses BUILD_GIT_SHA env var when set
var script = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-build-manifest.js'), 'utf8');

t('DOCKER_GIT_SHA_ARG_PRESENT', script.indexOf('BUILD_GIT_SHA') >= 0, '');
t('MANIFEST_FAILURE_NOT_IGNORED', script.indexOf('process.exit(1)') >= 0, '');
t('LOCKFILE_CHECKED', script.indexOf('package-lock.json') >= 0, '');

// Test package-lock.json is readable
try {
  var lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  var sha = crypto.createHash('sha256').update(JSON.stringify(lock)).digest('hex');
  t('LOCKFILE_READABLE', sha.length === 64, 'sha256=' + sha);
} catch(e) {
  t('LOCKFILE_READABLE', false, e.message);
}

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
