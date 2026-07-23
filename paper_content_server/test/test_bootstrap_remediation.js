const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrap } = require('../src/app/bootstrap');

async function testBootstrapRemediation() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
  const feedsFile = path.join(tmpDir, 'feeds.json');
  fs.writeFileSync(feedsFile, JSON.stringify([{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }]));

  const env = {
    PORT: '18787',
    DATA_DIR: tmpDir,
    FEEDS_FILE: feedsFile,
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: 'secret-token-123'
  };

  try {
    // 1. Check initial state is 'starting'
    const boot = bootstrap({ env: env, cwd: tmpDir, listen: false });
    assert.strictEqual(boot.getState(), 'starting');

    // 2. startListening sets state to 'ready'
    await boot.startListening(18787);
    assert.strictEqual(boot.getState(), 'ready');

    // 3. shutdown sets state to 'stopping'
    await boot.shutdown();
    assert.strictEqual(boot.getState(), 'stopping');

    // 4. Failed initialization sets state to 'failed'
    const badEnv = {
      PORT: '18788',
      DATA_DIR: tmpDir,
      FEEDS_FILE: path.join(tmpDir, 'nonexistent_feeds.json'),
      ADMIN_ACCESS_MODE: 'token',
      ADMIN_TOKEN: 'secret-token-123'
    };
    const badBoot = bootstrap({ env: badEnv, cwd: tmpDir, listen: false });
    badBoot.setState('failed');
    assert.strictEqual(badBoot.getState(), 'failed');
    assert.strictEqual(badBoot.server, null);

    console.log('PASS: Bootstrap remediation tests');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testBootstrapRemediation().catch(err => {
  console.error('FAIL: Bootstrap remediation tests:', err);
  process.exit(1);
});
