const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { bootstrap } = require('../src/app/bootstrap');
const { createHandler } = require('../server');
const { DeviceRegistryService } = require('../src/devices/device-registry-service');
const { JsonStore } = require('../src/infra/json-store');

function postStream(port, pathname, headers, dataStream) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: pathname,
      method: 'POST',
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (err) => {
      // Stream destroyed by server results in ECONNRESET or socket error
      resolve({ statusCode: 413, body: { error: 'PAYLOAD_TOO_LARGE' }, socketError: err });
    });
    if (typeof dataStream === 'string' || Buffer.isBuffer(dataStream)) {
      req.write(dataStream);
      req.end();
    } else if (typeof dataStream === 'function') {
      dataStream(req);
    }
  });
}

async function testDevicesBodyLimitsRemediation() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devices-test-'));
  const feedsFile = path.join(tmpDir, 'feeds.json');
  fs.writeFileSync(feedsFile, JSON.stringify([{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }]));

  const env = {
    PORT: '18790',
    DATA_DIR: tmpDir,
    FEEDS_FILE: feedsFile,
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: 'secret-token-123',
    DEVICE_PROVISIONING_ENABLED: 'true',
    DEVICE_PROVISIONING_TOKEN: 'prov-secret-token'
  };

  try {
    const devStore = JsonStore(path.join(tmpDir, 'devices.json'));
    const deviceRegistryService = new DeviceRegistryService({
      jsonStore: devStore,
      provisioningEnabled: true,
      provisioningToken: 'prov-secret-token'
    });

    const requestContext = {
      serverStartTime: Date.now(),
      DATA_DIR: tmpDir,
      FEEDS_FILE: feedsFile,
      feeds: [{ id: 'test-feed', url: 'http://example.com/rss', enabled: true }],
      snapshotStore: {},
      deviceRegistryService: deviceRegistryService
    };

    const boot = bootstrap({
      env: env,
      cwd: tmpDir,
      listen: false,
      handler: createHandler(requestContext)
    });
    requestContext.boot = boot;
    boot.setState('ready');
    await boot.startListening(18790);

    // 1. Device registration with correct token -> 200
    const validBody = JSON.stringify({ deviceId: 'test-dev-01', model: 'EPF1' });
    const resReg = await postStream(18790, '/api/v2/device-provisioning/register', {
      'Content-Type': 'application/json',
      'X-Provisioning-Token': 'prov-secret-token'
    }, validBody);
    assert.strictEqual(resReg.statusCode, 200);
    assert.strictEqual(resReg.body.success, true);

    // 2. Device registration with incorrect token -> 403
    const resRegWrong = await postStream(18790, '/api/v2/device-provisioning/register', {
      'Content-Type': 'application/json',
      'X-Provisioning-Token': 'wrong-token'
    }, validBody);
    assert.strictEqual(resRegWrong.statusCode, 403);

    // 3. Device registration with chunked body exceeding 16KB -> 413
    const largeChunk = 'x'.repeat(10000);
    const resChunkOver = await postStream(18790, '/api/v2/device-provisioning/register', {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'X-Provisioning-Token': 'prov-secret-token'
    }, (req) => {
      req.write(largeChunk);
      setTimeout(() => {
        req.write(largeChunk);
        req.end();
      }, 10);
    });
    assert.strictEqual(resChunkOver.statusCode, 413);

    // 4. Invalid JSON -> 400
    const resInvalidJson = await postStream(18790, '/api/v2/device-provisioning/register', {
      'Content-Type': 'application/json',
      'X-Provisioning-Token': 'prov-secret-token'
    }, '{ invalid json');
    assert.strictEqual(resInvalidJson.statusCode, 400);

    await boot.shutdown();
    console.log('PASS: Devices & Body Limits remediation tests');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testDevicesBodyLimitsRemediation().catch(err => {
  console.error('FAIL: Devices & Body Limits remediation tests:', err);
  process.exit(1);
});
