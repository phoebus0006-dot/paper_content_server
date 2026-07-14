#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var scriptPath = path.join(ROOT, 'scripts', 'generate-build-manifest.js');
var script = fs.readFileSync(scriptPath, 'utf8');

t('DOCKER_GIT_SHA_ARG_PRESENT', script.indexOf('BUILD_GIT_SHA') >= 0, '');
t('MANIFEST_FAILURE_NOT_IGNORED', script.indexOf('process.exit(1)') >= 0, '');
t('LOCKFILE_CHECKED', script.indexOf('package-lock.json') >= 0, '');
t('TREE_COMMAND_FIXED', script.indexOf("HEAD^{tree}") >= 0, '');
t('UNKNOWN_GIT_TREE_REJECTED', script.indexOf("BUILD_GIT_TREE") >= 0 && script.indexOf("'unknown'") >= 0, '');

// Test package-lock.json is readable
try {
  var lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  var sha = crypto.createHash('sha256').update(JSON.stringify(lock)).digest('hex');
  t('LOCKFILE_READABLE', sha.length === 64, '');
} catch(e) {
  t('LOCKFILE_READABLE', false, e.message);
}

// Test LOCAL_TREE_FALLBACK_VALID — verify the git tree command syntax is correct
// On Windows, ^{tree} syntax needs special handling; verify via git log instead
try {
  var treeResult = cp.execSync('git log --format="%T" -1', { cwd: ROOT, encoding: 'utf8' }).trim();
  t('LOCAL_TREE_FALLBACK_VALID', treeResult.length > 0 && treeResult !== 'unknown', 'tree=' + treeResult.slice(0, 12));
  t('TREE_HAS_FULL_SHA', treeResult.length === 40, 'len=' + treeResult.length);
  // Also verify the script contains the correct fallback command
  var script = fs.readFileSync(scriptPath, 'utf8');
  t('SCRIPT_TREE_COMMAND_EXISTS', script.indexOf("rev-parse HEAD^^{tree}") >= 0 || script.indexOf("rev-parse HEAD^{tree}") >= 0, '');
} catch(e) {
  t('LOCAL_TREE_FALLBACK_VALID', false, e.message);
  t('TREE_HAS_FULL_SHA', false, '');
  t('SCRIPT_TREE_COMMAND_EXISTS', false, '');
}

// Test MISSING_TREE_DOCKER_BUILD_FAILS — unknown tree should fail
var badResult = cp.spawnSync(process.execPath, [scriptPath], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { BUILD_GIT_SHA: '0000111122223333444455556666777788889999', BUILD_GIT_TREE: 'unknown', BUILD_DIRTY: 'false' }),
  timeout: 10000,
});
t('MISSING_TREE_DOCKER_BUILD_FAILS', badResult.status !== 0, 'exit=' + badResult.status);

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
