const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const auditDir = path.join(rootDir, 'audit');

if (!fs.existsSync(auditDir)) {
  fs.mkdirSync(auditDir);
}

function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'node_modules' || file === '.git' || file === 'audit' || file === 'qa') {
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

const allFiles = walk(rootDir);
const beforeFiles = [];
const beforeHashes = {};
const protectedHashes = {};

const protectedPatterns = [
  /epaper/i,
  /esp32/i,
  /firmware/i,
  /panelIndex/i,
  /nas_key/i,
  /key_2026/i,
  /feeds\.json/i // Assuming this holds some user data
];

for (const filePath of allFiles) {
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const stat = fs.statSync(filePath);
  const hash = getFileHash(filePath);
  
  const isProtected = protectedPatterns.some(p => p.test(relativePath));
  
  beforeFiles.push({
    path: relativePath,
    size: stat.size,
    hash: hash,
    category: isProtected ? 'protected' : 'source',
    isProtected: isProtected,
    referencedBy: 'unknown',
    plannedAction: 'none',
    issueId: null,
    reason: 'Initial audit'
  });
  
  beforeHashes[relativePath] = hash;
  if (isProtected) {
    protectedHashes[relativePath] = hash;
  }
}

fs.writeFileSync(path.join(auditDir, 'before-files.json'), JSON.stringify(beforeFiles, null, 2));
fs.writeFileSync(path.join(auditDir, 'before-hashes.json'), JSON.stringify(beforeHashes, null, 2));
fs.writeFileSync(path.join(auditDir, 'protected-hashes.json'), JSON.stringify(protectedHashes, null, 2));

console.log('Audit files generated successfully.');
