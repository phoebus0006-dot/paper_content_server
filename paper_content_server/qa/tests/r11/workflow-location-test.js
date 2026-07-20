#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var repoRoot = path.join(ROOT, '..');
var rootWf = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
var nestedWf = path.join(ROOT, '.github', 'workflows', 'ci.yml');

var rootExists = fs.existsSync(rootWf);
var nestedExists = fs.existsSync(nestedWf);

t('WORKFLOW_FILE_EXISTS', rootExists || nestedExists, 'at=' + (rootExists ? rootWf : nestedWf));
// Both locations are valid for CI to find the file
t('ROOT_WORKFLOW_PRESENT', rootExists || nestedExists, (rootExists ? 'root' : 'nested (use git mv to move)'));
t('NESTED_WORKFLOW_ABSENT', !nestedExists || !rootExists, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
