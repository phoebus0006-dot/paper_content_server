const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const auditDir = path.join(rootDir, 'audit');

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'audit' || file === 'qa' || file === 'data') {
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

try {
  const protectedHashes = JSON.parse(fs.readFileSync(path.join(auditDir, 'protected-hashes.json'), 'utf8'));
  const beforeHashes = JSON.parse(fs.readFileSync(path.join(auditDir, 'before-hashes.json'), 'utf8'));
  
  let changeScope = {};
  if (fs.existsSync(path.join(auditDir, 'change-scope.proposed.json'))) {
    changeScope = JSON.parse(fs.readFileSync(path.join(auditDir, 'change-scope.proposed.json'), 'utf8'));
  }

  let failed = false;

  // 1. Check protected files
  for (const [relPath, originalHash] of Object.entries(protectedHashes)) {
    const currentHash = getFileHash(path.join(rootDir, relPath));
    if (currentHash !== originalHash) {
      console.error(`[ERROR] Protected file modified: ${relPath}`);
      failed = true;
    }
  }

  // 2. Check all current files against baseline
  const currentFiles = walk(rootDir);
  for (const filePath of currentFiles) {
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const currentHash = getFileHash(filePath);
    
    // Ignore exact matches
    if (beforeHashes[relPath] === currentHash) {
      continue;
    }
    
    // New or modified
    if (!protectedHashes[relPath] && !changeScope[relPath]) {
      console.error(`[ERROR] Unauthorized modification or creation: ${relPath}`);
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  } else {
    console.log('Scope check passed.');
  }

} catch (err) {
  console.error('[ERROR] Scope check failed to run:', err.message);
  process.exit(1);
}
