#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var repoRoot = path.join(ROOT, '..');
var candidates = [
  path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
  path.join(ROOT, '.github', 'workflows', 'ci.yml'),
];
var wf = null;
for (var i = 0; i < candidates.length; i++) {
  if (fs.existsSync(candidates[i])) { wf = candidates[i]; break; }
}

if (wf) {
  var content = fs.readFileSync(wf, 'utf8');
  t('WORKFLOW_FOUND', true, wf);
  t('CI_WORKING_DIRECTORY_CORRECT', content.indexOf("working-directory: paper_content_server") >= 0, '');
  t('CACHE_LOCKFILE_PATH_CORRECT', content.indexOf("cache-dependency-path: paper_content_server/package-lock.json") >= 0, '');
} else {
  t('WORKFLOW_FOUND', false, 'no workflow file found');
  t('CI_WORKING_DIRECTORY_CORRECT', false, 'workflow file not found');
  t('CACHE_LOCKFILE_PATH_CORRECT', false, 'workflow file not found');
}

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
