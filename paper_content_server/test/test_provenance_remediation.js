const assert = require('assert');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

function testProvenanceRemediation() {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-build-manifest.js');

  // 1. Passing short 12-char SHA -> rejected
  try {
    cp.execSync(`node "${scriptPath}"`, {
      env: Object.assign({}, process.env, {
        BUILD_MODE: 'release',
        BUILD_GIT_SHA: '123456789012', // 12 chars instead of 40
        BUILD_GIT_TREE: '1234567890123456789012345678901234567890',
        BUILD_DIRTY: 'false'
      }),
      stdio: 'pipe'
    });
    assert.fail('Should reject 12-char short SHA');
  } catch (err) {
    assert.strictEqual(err.status, 1);
    assert.ok(err.stderr.toString().includes('40-character'), 'Error message should mention 40-character requirement');
  }

  // 2. Passing valid 40-char SHA & tree -> succeeds and outputs sourceSha256
  const validSha = '1234567890123456789012345678901234567890';
  const validTree = '0987654321098765432109876543210987654321';
  const out = cp.execSync(`node "${scriptPath}"`, {
    env: Object.assign({}, process.env, {
      BUILD_MODE: 'release',
      BUILD_GIT_SHA: validSha,
      BUILD_GIT_TREE: validTree,
      BUILD_DIRTY: 'false'
    }),
    encoding: 'utf8'
  });

  const manifestPath = path.join(__dirname, '..', 'build-manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'build-manifest.json should be created');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.strictEqual(manifest.gitSha, validSha);
  assert.strictEqual(manifest.gitCommit, validSha);
  assert.strictEqual(manifest.gitTree, validTree);
  assert.strictEqual(manifest.dirty, false);
  assert.ok(manifest.sourceSha256, 'sourceSha256 should be present in manifest');
  assert.ok(manifest.gitArchiveSha256, 'gitArchiveSha256 should be present in manifest');

  // Cleanup build-manifest.json created during test
  fs.unlinkSync(manifestPath);

  console.log('PASS: Provenance remediation tests');
}

try {
  testProvenanceRemediation();
} catch (err) {
  console.error('FAIL: Provenance remediation tests:', err);
  process.exit(1);
}
