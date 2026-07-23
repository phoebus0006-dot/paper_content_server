const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrap } = require('../src/app/bootstrap');
const { createHandler } = require('../server');

function makeRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: port, path: pathname }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function testReadinessRemediation() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-test-'));
  const feedsFile = path.join(tmpDir, 'feeds.json');
  fs.writeFileSync(feedsFile, JSON.stringify([{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }]));

  const env = {
    PORT: '18789',
    DATA_DIR: tmpDir,
    FEEDS_FILE: feedsFile,
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: 'secret-token-123'
  };

  try {
    const requestContext = {
      serverStartTime: Date.now(),
      DATA_DIR: tmpDir,
      FEEDS_FILE: feedsFile,
      feeds: [{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }],
      snapshotStore: {},
      deviceRegistryService: {}
    };

    const boot = bootstrap({
      env: env,
      cwd: tmpDir,
      listen: false,
      handler: createHandler(requestContext)
    });
    requestContext.boot = boot;
    boot.setState('ready');

    await boot.startListening(18789);

    // 1. Normal state -> readiness 200 ready
    const resOK = await makeRequest(18789, '/health/ready');
    assert.strictEqual(resOK.statusCode, 200);
    assert.strictEqual(resOK.body.status, 'ready');
    assert.deepStrictEqual(resOK.body.issues, []);

    // 2. Corrupt / empty feeds -> readiness 503 not_ready
    requestContext.feeds = []; // empty feeds

    const resFail = await makeRequest(18789, '/health/ready');
    assert.strictEqual(resFail.statusCode, 503);
    assert.strictEqual(resFail.body.status, 'not_ready');
    assert.ok(resFail.body.issues.some(i => i.code === 'FEEDS_CONFIG_INVALID'), 'Should report FEEDS_CONFIG_INVALID');

    await boot.shutdown();
    console.log('PASS: Readiness remediation tests');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testReadinessRemediation().catch(err => {
  console.error('FAIL: Readiness remediation tests:', err);
  process.exit(1);
});
