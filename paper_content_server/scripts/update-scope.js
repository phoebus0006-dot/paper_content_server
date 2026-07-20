const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const auditDir = path.join(rootDir, 'audit');

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function shouldExclude(relPath) {
  const normalized = normalizePath(relPath);
  if (normalized === 'node_modules' || normalized.startsWith('node_modules/')) return true;
  if (normalized === '.git' || normalized.startsWith('.git/')) return true;
  if (normalized === 'qa/runtime' || normalized.startsWith('qa/runtime/')) return true;
  return false;
}

function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const relPath = path.relative(rootDir, filePath);
    if (shouldExclude(relPath)) continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) walk(filePath, fileList);
    else fileList.push(normalizePath(relPath));
  }
  return fileList;
}

const beforeHashesRaw = JSON.parse(fs.readFileSync(path.join(auditDir, 'before-hashes.json'), 'utf8'));
const beforeHashes = {};
for (const [k, v] of Object.entries(beforeHashesRaw)) beforeHashes[normalizePath(k)] = v;

const currentFiles = walk(rootDir);
const currentFilesSet = new Set(currentFiles);
const scope = [];

for (const relPath of currentFiles) {
  const hash = getFileHash(path.join(rootDir, relPath));
  if (beforeHashes[relPath] !== hash) {
    scope.push({ path: relPath, type: beforeHashes[relPath] ? 'MODIFY' : 'ADD' });
  }
}

for (const relPath of Object.keys(beforeHashes)) {
  if (!currentFilesSet.has(relPath)) {
    scope.push({ path: relPath, type: 'DELETE' });
  }
}

fs.writeFileSync(path.join(auditDir, 'change-scope.json'), JSON.stringify(scope, null, 2));
console.log(`Updated change-scope.json with ${scope.length} entries`);
