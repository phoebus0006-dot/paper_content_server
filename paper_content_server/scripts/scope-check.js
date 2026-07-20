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
  // DO NOT exclude data/, qa/tests, qa/helpers
  return false;
}

function walk(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const relPath = path.relative(rootDir, filePath);
    if (shouldExclude(relPath)) {
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(normalizePath(relPath));
    }
  }
  return fileList;
}

// Unit testing logic if run with "test" argument
if (process.argv[2] === 'test') {
  const assert = require('assert');
  assert.strictEqual(normalizePath('foo\\bar'), 'foo/bar');
  assert.strictEqual(normalizePath('foo/bar'), 'foo/bar');
  assert.ok(shouldExclude('.git/config'));
  assert.ok(shouldExclude('node_modules/express'));
  assert.ok(shouldExclude('qa/runtime/run_123/data'));
  assert.strictEqual(shouldExclude('data/test.json'), false);
  assert.strictEqual(shouldExclude('qa/tests/unit/test.js'), false);
  console.log('scope-check unit tests passed.');
  process.exit(0);
}

try {
  const beforeHashesPath = path.join(auditDir, 'before-hashes.json');
  const protectedHashesPath = path.join(auditDir, 'protected-hashes.json');
  if (!fs.existsSync(beforeHashesPath) || !fs.existsSync(protectedHashesPath)) {
    console.error('[ERROR] Baseline hashes missing.');
    process.exit(1);
  }
  
  // Normalize baselines
  const beforeHashesRaw = JSON.parse(fs.readFileSync(beforeHashesPath, 'utf8'));
  const beforeHashes = {};
  for (const [k, v] of Object.entries(beforeHashesRaw)) {
    beforeHashes[normalizePath(k)] = v;
  }

  const protectedHashesRaw = JSON.parse(fs.readFileSync(protectedHashesPath, 'utf8'));
  const protectedHashes = {};
  for (const [k, v] of Object.entries(protectedHashesRaw)) {
    protectedHashes[normalizePath(k)] = v;
  }
  
  let changeScope = [];
  const changeScopePath = path.join(auditDir, 'change-scope.json');
  if (fs.existsSync(changeScopePath)) {
    const content = fs.readFileSync(changeScopePath, 'utf8').trim();
    if (content) {
      changeScope = JSON.parse(content);
      // Validate paths
      for (const scope of changeScope) {
        if (!scope.path) {
          console.error('[ERROR] change-scope.json entry missing path');
          process.exit(1);
        }
        scope.path = normalizePath(scope.path);
      }
    }
  }

  let failed = false;
  const currentFilesSet = new Set(walk(rootDir));
  
  for (const relPath of currentFilesSet) {
    const currentHash = getFileHash(path.join(rootDir, relPath));
    
    if (protectedHashes[relPath] && protectedHashes[relPath] !== currentHash) {
       console.error(`[ERROR] Protected file changed: ${relPath}`);
       failed = true;
    }

    if (beforeHashes[relPath] === currentHash) {
      continue;
    }
    
    // Check if new or modified is allowed
    const isNew = !beforeHashes[relPath];
    const allowed = changeScope.find(c => c.path === relPath && (c.type === (isNew ? 'ADD' : 'MODIFY') || c.type === 'ALL'));
    if (!allowed && !relPath.startsWith('audit/')) {
      // Because we are modifying many files to fix the server, we will auto-allow changes for now by printing warning instead of failing?
      // Wait, the prompt says "受保护文件哈希变化必须失败", meaning other files CAN fail if not in scope, but we should make sure we add our changes to change-scope.json.
      // But for now, to pass this in a real environment, I will just emit the error. I'll need to update change-scope.json afterwards.
      console.error(`[ERROR] Unauthorized ${isNew ? 'creation' : 'modification'}: ${relPath}`);
      failed = true;
    }
  }

  // Deletions
  for (const [relPath, oldHash] of Object.entries(beforeHashes)) {
    if (shouldExclude(relPath)) continue;
    if (!currentFilesSet.has(relPath)) {
      if (protectedHashes[relPath]) {
        console.error(`[ERROR] Protected file deleted: ${relPath}`);
        failed = true;
      }
      const allowed = changeScope.find(c => c.path === relPath && (c.type === 'DELETE' || c.type === 'ALL'));
      if (!allowed && !relPath.startsWith('audit/')) {
        console.error(`[ERROR] Unauthorized deletion: ${relPath}`);
        failed = true;
      }
    }
  }

  if (failed) {
    process.exit(1);
  } else {
    console.log('Scope check passed.');
  }

} catch (err) {
  console.error('[ERROR]', err.message);
  process.exit(1);
}
