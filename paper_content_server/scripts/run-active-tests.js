const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'qa', 'manifest.json');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('FAIL: qa/manifest.json missing');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const category = process.argv[2] || 'all';

// Extract tests list
const allTests = Array.isArray(manifest.tests) ? manifest.tests : Object.values(manifest.categories || {}).flat();

const activeTests = allTests.filter(t => t.status === 'ACTIVE' && (category === 'all' || t.category === category));

if (activeTests.length === 0) {
  console.error(`FAIL: 0 active tests found for category ${category}`);
  process.exit(1);
}

// Check for duplicates
const ids = new Set();
for (const t of allTests) {
  if (ids.has(t.id)) {
    console.error(`FAIL: duplicate ID found in manifest: ${t.id}`);
    process.exit(1);
  }
  ids.add(t.id);
  
  if (t.status === 'ACTIVE' && t.path.includes('archive/')) {
    console.error(`FAIL: manifest references archive test as active: ${t.path}`);
    process.exit(1);
  }
}

let passed = 0;
let failed = 0;
let skipped = 0;

for (const t of activeTests) {
  const fullPath = path.join(ROOT_DIR, t.path);
  if (!fs.existsSync(fullPath)) {
    console.error(`FAIL: test file missing ${t.path}`);
    failed++;
    continue;
  }

  const timeoutMs = t.timeoutMs || 30000;
  
  const result = spawnSync(process.execPath, ['--test', fullPath], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    timeout: timeoutMs
  });

  if (result.error && result.error.code === 'ETIMEDOUT') {
    console.error(`FAIL: test timed out ${t.path}`);
    failed++;
    continue;
  }
  if (result.signal) {
    console.error(`FAIL: test terminated by signal ${result.signal} ${t.path}`);
    failed++;
    continue;
  }

  // Node --test exits with 0 on success, non-zero on fail
  if (result.status === 0) {
    passed++;
  } else {
    failed++;
  }
}

console.log(`Results: ${passed} passed, ${skipped} skipped, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
if (passed === 0) {
  console.error('FAIL: 0 tests passed or all tests skipped');
  process.exit(1);
}

process.exit(0);
