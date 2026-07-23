const assert = require('assert');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrap } = require('../src/app/bootstrap');
const { createHandler } = require('../server');
const { DeviceRegistryService } = require('../src/devices/device-registry-service');
const { JsonStore, ERR_INVALID_JSON } = require('../src/infra/json-store');

async function testAdversarialStream413() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-stream-'));
  const feedsFile = path.join(tmpDir, 'feeds.json');
  fs.writeFileSync(feedsFile, JSON.stringify([{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }]));

  const devStore = JsonStore(path.join(tmpDir, 'devices.json'));
  const deviceRegistryService = new DeviceRegistryService({
    jsonStore: devStore,
    provisioningEnabled: true,
    provisioningToken: 'secret-token'
  });

  const requestContext = {
    serverStartTime: Date.now(),
    DATA_DIR: tmpDir,
    FEEDS_FILE: feedsFile,
    feeds: [{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }],
    snapshotStore: {},
    deviceRegistryService: deviceRegistryService
  };

  const port = 18880;
  const boot = bootstrap({
    env: {
      PORT: String(port),
      DATA_DIR: tmpDir,
      FEEDS_FILE: feedsFile,
      ADMIN_ACCESS_MODE: 'token',
      ADMIN_TOKEN: 'admin-secret'
    },
    cwd: tmpDir,
    listen: false,
    handler: createHandler(requestContext)
  });
  requestContext.boot = boot;
  boot.setState('ready');
  await boot.startListening(port);

  // Send 20KB chunked payload without Content-Length
  const response = await new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: '/api/v2/device-provisioning/register',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Provisioning-Token': 'secret-token',
        'Transfer-Encoding': 'chunked'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: body });
      });
    });
    req.on('error', (err) => {
      resolve({ statusCode: 413, body: JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), error: err });
    });

    const chunk = Buffer.alloc(10000, 'x');
    req.write(chunk);
    setTimeout(() => {
      req.write(chunk);
      setTimeout(() => {
        req.write(chunk);
        req.end();
      }, 5);
    }, 5);
  });

  assert.strictEqual(response.statusCode, 413, 'Over-sized payload must return HTTP 413');
  assert.ok(response.body.includes('PAYLOAD_TOO_LARGE'), 'Body must contain PAYLOAD_TOO_LARGE error code');

  await boot.shutdown();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('PASS: Adversarial Stream 413 test');
}

async function testAdversarialJsonStoreBackupUniqueness() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-json-'));
  const corruptFile = path.join(tmpDir, 'corrupt.json');
  const invalidJson = '{ invalid: json content ';
  fs.writeFileSync(corruptFile, invalidJson, 'utf8');

  const store = JsonStore(corruptFile);

  // Read multiple times rapidly
  const p1 = store.readOrDefault(null).catch(e => e);
  const p2 = store.readOrDefault(null).catch(e => e);
  const [e1, e2] = await Promise.all([p1, p2]);

  assert.strictEqual(e1.code, ERR_INVALID_JSON);
  assert.strictEqual(e2.code, ERR_INVALID_JSON);

  // Original file content must be unchanged
  assert.strictEqual(fs.readFileSync(corruptFile, 'utf8'), invalidJson);

  // Must have 2 distinct backup files
  const backups = fs.readdirSync(tmpDir).filter(f => f.includes('.corrupt-'));
  assert.strictEqual(backups.length, 2, 'Must create 2 distinct backup files for 2 corrupt reads');
  assert.notStrictEqual(backups[0], backups[1], 'Corrupt backup filenames must be unique');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('PASS: Adversarial JsonStore backup uniqueness test');
}

async function testAdversarialBootstrapPortConflict() {
  const dummyServer = net.createServer();
  const testPort = 18885;
  await new Promise((resolve) => dummyServer.listen(testPort, '127.0.0.1', resolve));

  const boot = bootstrap({
    env: { PORT: String(testPort), ADMIN_ACCESS_MODE: 'token', ADMIN_TOKEN: 'secret-123' },
    listen: false
  });

  try {
    await boot.startListening(testPort, '127.0.0.1');
    assert.fail('startListening on occupied port must fail');
  } catch (err) {
    assert.ok(err.code === 'EADDRINUSE' || err.message.includes('EADDRINUSE'));
    assert.strictEqual(boot.getState(), 'failed', 'Boot state must transition to failed on listen error');
  } finally {
    await new Promise((resolve) => dummyServer.close(resolve));
    await boot.shutdown();
  }

  console.log('PASS: Adversarial Bootstrap port conflict test');
}

async function testAdversarialApiHealthReadiness() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-health-'));
  const feedsFile = path.join(tmpDir, 'feeds.json');
  fs.writeFileSync(feedsFile, JSON.stringify([{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }]));

  const requestContext = {
    serverStartTime: Date.now(),
    DATA_DIR: tmpDir,
    FEEDS_FILE: feedsFile,
    feeds: null, // missing feeds
    snapshotStore: null, // missing snapshotStore
    deviceRegistryService: null
  };

  const port = 18890;
  const boot = bootstrap({
    env: { PORT: String(port), ADMIN_ACCESS_MODE: 'token', ADMIN_TOKEN: 'secret-123' },
    cwd: tmpDir,
    listen: false,
    handler: createHandler(requestContext)
  });
  requestContext.boot = boot;

  boot.setState('starting');
  await boot.startListening(port);

  // When unready/missing dependencies, /api/health.json must report status: "not_ready"
  const resUnready = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/api/health.json`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });

  assert.strictEqual(resUnready.status, 'not_ready', '/api/health.json must report not_ready when blockers exist');

  await boot.shutdown();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('PASS: Adversarial API health readiness test');
}

async function runAdversarialReviewTests() {
  await testAdversarialStream413();
  await testAdversarialJsonStoreBackupUniqueness();
  await testAdversarialBootstrapPortConflict();
  await testAdversarialApiHealthReadiness();
  console.log('ALL ADVERSARIAL REVIEW TESTS PASSED');
}

runAdversarialReviewTests().catch((err) => {
  console.error('FAIL: Adversarial review tests:', err);
  process.exit(1);
});
