#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');

t('GIT_SHA_ARG_PRESENT', dockerfile.indexOf('ARG GIT_SHA') >= 0, '');
t('GIT_TREE_ARG_PRESENT', dockerfile.indexOf('ARG GIT_TREE') >= 0, '');
t('BUILD_DIRTY_ARG_PRESENT', dockerfile.indexOf('ARG BUILD_DIRTY') >= 0, '');
t('ENV_GIT_SHA_SET', dockerfile.indexOf('ENV BUILD_GIT_SHA') >= 0, '');
t('MANIFEST_NOT_IGNORED', dockerfile.indexOf('2>/dev/null || true') < 0, 'no ignore');
t('MANIFEST_RUN_UNCONDITIONAL', dockerfile.indexOf('RUN node scripts/generate-build-manifest.js') >= 0, '');

// Verify non-root user
t('NON_ROOT_USER', dockerfile.indexOf('USER appuser') >= 0, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
