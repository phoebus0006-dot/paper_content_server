#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var manifest = { schemaVersion: 1 };

var envSha = process.env.BUILD_GIT_SHA || '';
var envTree = process.env.BUILD_GIT_TREE || '';
var envDirty = process.env.BUILD_DIRTY || '';

if (envSha && envSha !== 'unknown') {
  manifest.gitSha = envSha;
  manifest.gitTree = envTree || 'unknown';
  manifest.dirty = envDirty === 'true' || envDirty === '1';
} else {
  // Local fallback (non-container)
  try {
    var sha = cp.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    manifest.gitSha = sha;
  } catch(e) { manifest.gitSha = 'unknown'; }

  try {
    var tree = cp.execSync('git rev-parse HEAD:',
      { cwd: ROOT, encoding: 'utf8' }).trim();
    manifest.gitTree = tree;
  } catch(e) { manifest.gitTree = 'unknown'; }

  try {
    var status = cp.execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
    manifest.dirty = status.length > 0;
  } catch(e) { manifest.dirty = true; }
}

if (!manifest.gitSha || manifest.gitSha === 'unknown') {
  console.error('BUILD_GIT_SHA is missing or unknown');
  process.exit(1);
}

if (manifest.dirty) {
  console.error('Dirty worktree: refusing to generate release artifact');
  process.exit(1);
}

manifest.nodeVersion = process.version;

try {
  var lockContent = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
  manifest.lockfileSha256 = crypto.createHash('sha256').update(lockContent).digest('hex');
} catch(e) {
  console.error('package-lock.json not readable');
  process.exit(1);
}

manifest.builtAt = new Date().toISOString();

var outPath = path.join(ROOT, 'build-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Build manifest written to ' + outPath);
console.log(JSON.stringify(manifest, null, 2));
process.exit(0);
