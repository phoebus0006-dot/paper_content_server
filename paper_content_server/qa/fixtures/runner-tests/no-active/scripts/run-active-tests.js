const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = process.env.MANIFEST_PATH || path.join(ROOT_DIR, 'qa', 'manifest.json');

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

let overallPassed = 0;
let overallFailed = 0;
let overallSkipped = 0;

for (const t of activeTests) {
  const fullPath = path.join(ROOT_DIR, t.path);
  if (!fs.existsSync(fullPath)) {
    console.error(`FAIL: test file missing ${t.path}`);
    console.error("FAIL: " + t.path); overallFailed++;
    continue;
  }

  const timeoutMs = t.timeoutMs || 30000;
  
  const result = spawnSync(process.execPath, ['--test', fullPath], {
    cwd: ROOT_DIR,
    timeout: timeoutMs,
    encoding: 'utf8'
  });

  if (result.error && result.error.code === 'ETIMEDOUT') {
    console.error(`FAIL: test timed out ${t.path}`);
    console.error("FAIL: " + t.path); overallFailed++;
    continue;
  }
  if (result.signal) {
    console.error(`FAIL: test terminated by signal ${result.signal} ${t.path}`);
    console.error("FAIL: " + t.path); overallFailed++;
    continue;
  }

  let testPassed = 0;
  let testFailed = 0;
  let testSkipped = 0;

  if (result.stdout) {
    const passMatch = result.stdout.match(/ℹ pass (\d+)/);
    const failMatch = result.stdout.match(/ℹ fail (\d+)/);
    const skipMatch = result.stdout.match(/ℹ skipped (\d+)/);
    
    if (passMatch) testPassed = parseInt(passMatch[1], 10);
    if (failMatch) testFailed = parseInt(failMatch[1], 10);
    if (skipMatch) testSkipped = parseInt(skipMatch[1], 10);
  }

  overallPassed += testPassed;
  overallFailed += testFailed;
  overallSkipped += testSkipped;

  if (result.status !== 0) {
    console.error("FAIL: " + t.path); overallFailed++;
  } else if (testFailed > 0) {
    console.error("FAIL: " + t.path); overallFailed++;
  } else if (testPassed === 0) {
    console.error(`FAIL: test file ${t.path} had 0 passing tests (perhaps skipped or empty)`);
    console.error("FAIL: " + t.path); overallFailed++;
  }
}

console.log(`Results: ${overallPassed} passed, ${overallSkipped} skipped, ${overallFailed} failed`);

if (overallFailed > 0) {
  process.exit(1);
}

process.exit(0);
