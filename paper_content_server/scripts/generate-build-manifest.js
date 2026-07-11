#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var manifest = { schemaVersion: 1 };

try {
  var sha = cp.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  manifest.gitSha = sha;
} catch(e) { manifest.gitSha = 'unknown'; }

try {
  var tree = cp.execSync('git rev-parse HEAD:',
    { cwd: ROOT, encoding: 'utf8' }).trim();
  manifest.gitTree = tree;
} catch(e) { manifest.gitTree = 'unknown'; }

manifest.nodeVersion = process.version;

try {
  var lockContent = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
  manifest.lockfileSha256 = crypto.createHash('sha256').update(lockContent).digest('hex');
} catch(e) { manifest.lockfileSha256 = 'unknown'; }

manifest.builtAt = new Date().toISOString();

try {
  var status = cp.execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  manifest.dirty = status.length > 0;
} catch(e) { manifest.dirty = true; }

if (manifest.dirty) {
  console.error('Dirty worktree: refusing to generate release artifact');
  process.exit(1);
}

var outPath = path.join(ROOT, 'build-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Build manifest written to ' + outPath);
console.log(JSON.stringify(manifest, null, 2));
process.exit(0);
