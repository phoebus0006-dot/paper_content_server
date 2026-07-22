const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { DeviceRegistryService } = require('../../src/devices/device-registry-service');
const { JsonStore } = require('../../src/infra/json-store');
const { createApplication } = require('../../src/app-factory');

const tmpRootDir = path.join(__dirname, '..', '..', 'test_temp', 'device-registry-sec-' + Date.now());
fs.mkdirSync(tmpRootDir, { recursive: true });

function makeTmpDir(name) {
  const dir = path.join(tmpRootDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('DeviceRegistryService — Security & Architecture Unit Tests', async (t) => {
  const dataDir = makeTmpDir('unit-service');
  const jsonPath = path.join(dataDir, 'devices.json');

  let mockNow = 1000000000000;
  const mockClock = {
    nowMs: () => mockNow,
    nowIso: () => new Date(mockNow).toISOString()
  };

  const jsonStore = new JsonStore(jsonPath, { schemaVersion: 1 });
  const service = new DeviceRegistryService({
    jsonStore,
    clock: mockClock,
    provisioningEnabled: true,
    provisioningToken: 'secret-prov-token-123'
  });

  await t.test('1. Provisioning disabled returns PROVISIONING_DISABLED', async () => {
    const disabledService = new DeviceRegistryService({
      jsonStore: new JsonStore(path.join(makeTmpDir('disabled-prov'), 'devices.json')),
      provisioningEnabled: false
    });

    await assert.rejects(async () => {
      await disabledService.registerDevice({ deviceId: 'dev-01' }, { provisioningToken: 'secret-prov-token-123' });
    }, (err) => err.code === 'PROVISIONING_DISABLED');
  });

  await t.test('2. Invalid provisioning token returns INVALID_PROVISIONING_TOKEN', async () => {
    await assert.rejects(async () => {
      await service.registerDevice({ deviceId: 'dev-01' }, { provisioningToken: 'wrong-token' });
    }, (err) => err.code === 'INVALID_PROVISIONING_TOKEN');
  });

  await t.test('3. Invalid deviceId formats return INVALID_DEVICE_ID', async () => {
    const invalidIds = ['../bad', 'dev/123', 'dev 123', 'dev#1', ''];
    for (const badId of invalidIds) {
      await assert.rejects(async () => {
        await service.registerDevice({ deviceId: badId }, { provisioningToken: 'secret-prov-token-123' });
      }, (err) => err.code === 'INVALID_DEVICE_ID', `Should reject bad deviceId: ${badId}`);
    }
  });

  let deviceAToken = '';
  await t.test('4. Successful registration returns deviceToken ONCE and persists credentialHash', async () => {
    const regRes = await service.registerDevice({
      deviceId: 'dev-alpha',
      name: 'Device Alpha',
      type: 'esp32-epaper',
      firmwareVersion: '1.0.0',
      capabilities: { wifi: true }
    }, { provisioningToken: 'secret-prov-token-123', observedIp: '192.168.1.100' });

    assert.strictEqual(regRes.success, true);
    assert.strictEqual(regRes.deviceId, 'dev-alpha');
    assert.ok(regRes.deviceToken && regRes.deviceToken.length === 64);
    deviceAToken = regRes.deviceToken;

    // Check querying device strips credentialHash and returns status
    const dev = await service.getDevice('dev-alpha');
    assert.strictEqual(dev.deviceId, 'dev-alpha');
    assert.strictEqual(dev.status, 'online');
    assert.strictEqual(dev.credentialHash, undefined);
    assert.strictEqual(dev.deviceToken, undefined);
  });

  await t.test('5. Heartbeat for unregistered device returns DEVICE_NOT_REGISTERED', async () => {
    await assert.rejects(async () => {
      await service.heartbeat('unknown-dev', {}, { deviceToken: 'some-token' });
    }, (err) => err.code === 'DEVICE_NOT_REGISTERED');
  });

  await t.test('6. Heartbeat with missing or invalid token returns UNAUTHORIZED', async () => {
    // Missing token
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', {}, { deviceToken: null });
    }, (err) => err.code === 'UNAUTHORIZED');

    // Wrong token
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', {}, { deviceToken: 'wrong-device-token' });
    }, (err) => err.code === 'UNAUTHORIZED');
  });

  let deviceBToken = '';
  await t.test('7. Token for Device A cannot authenticate Device B', async () => {
    const regB = await service.registerDevice({ deviceId: 'dev-beta' }, { provisioningToken: 'secret-prov-token-123' });
    deviceBToken = regB.deviceToken;

    // Try B token on A
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', {}, { deviceToken: deviceBToken });
    }, (err) => err.code === 'UNAUTHORIZED');
  });

  await t.test('8. Heartbeat whitelist validation rejects unallowed fields', async () => {
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', { unallowedField: 'hacked' }, { deviceToken: deviceAToken });
    }, (err) => err.code === 'UNALLOWED_FIELD');
  });

  await t.test('9. Heartbeat field type/range validation', async () => {
    // Invalid battery (> 100)
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', { battery: 150 }, { deviceToken: deviceAToken });
    }, (err) => err.code === 'INVALID_HEARTBEAT_PAYLOAD');

    // Invalid rssi (> 0)
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', { rssi: 10 }, { deviceToken: deviceAToken });
    }, (err) => err.code === 'INVALID_HEARTBEAT_PAYLOAD');

    // Invalid currentFrameSha256 (not 64 hex)
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', { currentFrameSha256: 'not-hex' }, { deviceToken: deviceAToken });
    }, (err) => err.code === 'INVALID_HEARTBEAT_PAYLOAD');

    // Invalid contentMode
    await assert.rejects(async () => {
      await service.heartbeat('dev-alpha', { contentMode: 'invalid-mode' }, { deviceToken: deviceAToken });
    }, (err) => err.code === 'INVALID_HEARTBEAT_PAYLOAD');
  });

  await t.test('10. Valid Heartbeat updates device & server timestamps', async () => {
    mockNow += 60000; // 1 min later
    const updated = await service.heartbeat('dev-alpha', {
      firmwareVersion: '1.0.1',
      battery: 98,
      rssi: -55,
      contentMode: 'news'
    }, { deviceToken: deviceAToken, observedIp: '192.168.1.200' });

    assert.strictEqual(updated.deviceId, 'dev-alpha');
    assert.strictEqual(updated.firmwareVersion, '1.0.1');
    assert.strictEqual(updated.battery, 98);
    assert.strictEqual(updated.rssi, -55);
    assert.strictEqual(updated.contentMode, 'news');
    assert.strictEqual(updated.observedIp, '192.168.1.200');
    assert.strictEqual(updated.status, 'online');
    assert.strictEqual(updated.credentialHash, undefined);
  });

  await t.test('11. Dynamic status: lastSeen >= 5 mins is offline', async () => {
    mockNow += 6 * 60 * 1000; // 6 mins later
    const dev = await service.getDevice('dev-alpha');
    assert.strictEqual(dev.status, 'offline');
  });

  await t.test('12. Corrupt JSON creates corrupt backup and throws DEVICE_REGISTRY_CORRUPT', async () => {
    const corruptDir = makeTmpDir('corrupt-test');
    const corruptJsonPath = path.join(corruptDir, 'devices.json');
    fs.writeFileSync(corruptJsonPath, '{ invalid json content !!!', 'utf8');

    const corruptService = new DeviceRegistryService({
      jsonStore: new JsonStore(corruptJsonPath, { schemaVersion: 1 })
    });

    await assert.rejects(async () => {
      await corruptService.listDevices();
    }, (err) => err.code === 'DEVICE_REGISTRY_CORRUPT');

    // Check backup corrupt file was created
    const files = fs.readdirSync(corruptDir);
    const backup = files.find(f => f.includes('corrupt-'));
    assert.ok(backup, 'Corrupt backup file should be created');
  });

  await t.test('13. Write amplification control: throttling lastSeenAt writes', async () => {
    const throttleDir = makeTmpDir('throttle-test');
    const throttleJsonPath = path.join(throttleDir, 'devices.json');
    const tStore = new JsonStore(throttleJsonPath, { schemaVersion: 1 });
    const tService = new DeviceRegistryService({
      jsonStore: tStore,
      clock: mockClock,
      provisioningEnabled: true,
      provisioningToken: 'token-123',
      flushIntervalMs: 60000 // 60s throttle
    });

    const reg = await tService.registerDevice({ deviceId: 'dev-throttle' }, { provisioningToken: 'token-123' });
    const initialWriteTime = tService.lastDiskWriteMs;

    // Heartbeat with ONLY lastSeenAt change
    mockNow += 5000; // 5s later
    await tService.heartbeat('dev-throttle', {}, { deviceToken: reg.deviceToken });

    // Disk write time should NOT have changed (throttled)
    assert.strictEqual(tService.lastDiskWriteMs, initialWriteTime);

    // Heartbeat with CRITICAL field change
    mockNow += 5000; // 5s later
    await tService.heartbeat('dev-throttle', { battery: 50 }, { deviceToken: reg.deviceToken });

    // Critical change triggers immediate write
    assert.ok(tService.lastDiskWriteMs > initialWriteTime);
  });

  await t.test('14. Concurrency test: 50 concurrent registrations & 100 heartbeats', async () => {
    const concDir = makeTmpDir('conc-test');
    const concService = new DeviceRegistryService({
      jsonStore: new JsonStore(path.join(concDir, 'devices.json')),
      provisioningEnabled: true,
      provisioningToken: 'conc-token'
    });

    // 50 concurrent registrations
    const regPromises = [];
    for (let i = 0; i < 50; i++) {
      regPromises.push(concService.registerDevice({
        deviceId: `conc-dev-${i}`
      }, { provisioningToken: 'conc-token' }));
    }

    const regResults = await Promise.all(regPromises);
    assert.strictEqual(regResults.length, 50);

    const devList = await concService.listDevices();
    assert.strictEqual(devList.length, 50);

    // 100 concurrent heartbeats on dev-0
    const dev0Token = regResults[0].deviceToken;
    const hbPromises = [];
    for (let j = 0; j < 100; j++) {
      hbPromises.push(concService.heartbeat('conc-dev-0', {
        battery: (j % 100)
      }, { deviceToken: dev0Token }));
    }

    await Promise.all(hbPromises);
    await concService.flush();

    const finalDevs = await concService.listDevices();
    assert.strictEqual(finalDevs.length, 50);
  });

  await t.test('15. Multi-Application Isolation', async () => {
    const appDirA = makeTmpDir('app-a');
    const appDirB = makeTmpDir('app-b');

    const appA = createApplication({ dataDir: appDirA, deviceProvisioningEnabled: true, deviceProvisioningToken: 'token-a' });
    const appB = createApplication({ dataDir: appDirB, deviceProvisioningEnabled: true, deviceProvisioningToken: 'token-b' });

    const serviceA = (appA.runtime || appA.requestContext).deviceRegistryService;
    const serviceB = (appB.runtime || appB.requestContext).deviceRegistryService;

    const devA = await serviceA.registerDevice({ deviceId: 'dev-app-a' }, { provisioningToken: 'token-a' });
    const devB = await serviceB.registerDevice({ deviceId: 'dev-app-b' }, { provisioningToken: 'token-b' });

    const listA = await serviceA.listDevices();
    const listB = await serviceB.listDevices();

    assert.strictEqual(listA.length, 1);
    assert.strictEqual(listA[0].deviceId, 'dev-app-a');

    assert.strictEqual(listB.length, 1);
    assert.strictEqual(listB[0].deviceId, 'dev-app-b');

    // Token for A fails on B
    await assert.rejects(async () => {
      await serviceB.heartbeat('dev-app-b', {}, { deviceToken: devA.deviceToken });
    }, (err) => err.code === 'UNAUTHORIZED');
  });
});

test('Device Registry HTTP API & Security Contracts', async (t) => {
  const dataDir = makeTmpDir('http-test');
  const appCtx = createApplication({
    dataDir,
    deviceProvisioningEnabled: true,
    deviceProvisioningToken: 'http-prov-token-999',
    adminAccessMode: 'lan'
  });

  const server = http.createServer((req, res) => {
    appCtx.app(req, res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  function makeRequest(method, urlPath, headers, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(baseUrl + urlPath);
      const reqHeaders = Object.assign({ 'Host': '127.0.0.1' }, headers || {});
      let bodyBuf = null;
      if (body) {
        bodyBuf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        reqHeaders['Content-Length'] = bodyBuf.length;
        if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
      }

      const req = http.request(u, { method, headers: reqHeaders }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, body: parsed });
        });
      });
      req.on('error', reject);
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }

  let registeredToken = '';

  await t.test('POST /api/v2/device-provisioning/register with invalid token returns 403', async () => {
    const res = await makeRequest('POST', '/api/v2/device-provisioning/register', {
      'X-Provisioning-Token': 'wrong-prov-token'
    }, { deviceId: 'http-dev-1' });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'INVALID_PROVISIONING_TOKEN');
  });

  await t.test('POST /api/v2/device-provisioning/register with valid token succeeds and returns token once', async () => {
    const res = await makeRequest('POST', '/api/v2/device-provisioning/register', {
      'X-Provisioning-Token': 'http-prov-token-999'
    }, { deviceId: 'http-dev-1', name: 'HTTP Device 1' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.deviceId, 'http-dev-1');
    assert.ok(res.body.deviceToken && res.body.deviceToken.length === 64);
    registeredToken = res.body.deviceToken;
  });

  await t.test('POST /api/v2/devices/unknown/heartbeat returns 404 DEVICE_NOT_REGISTERED', async () => {
    const res = await makeRequest('POST', '/api/v2/devices/unknown/heartbeat', {
      'X-Device-Token': registeredToken
    }, { battery: 90 });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'DEVICE_NOT_REGISTERED');
  });

  await t.test('POST /api/v2/devices/http-dev-1/heartbeat with wrong token returns 401', async () => {
    const res = await makeRequest('POST', '/api/v2/devices/http-dev-1/heartbeat', {
      'X-Device-Token': 'bad-token-xxx'
    }, { battery: 90 });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED');
  });

  await t.test('POST /api/v2/devices/http-dev-1/heartbeat with valid token succeeds', async () => {
    const res = await makeRequest('POST', '/api/v2/devices/http-dev-1/heartbeat', {
      'X-Device-Token': registeredToken
    }, { battery: 88, rssi: -60, contentMode: 'photo' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.device.battery, 88);
    assert.strictEqual(res.body.device.credentialHash, undefined);
    assert.strictEqual(res.body.device.deviceToken, undefined);
  });

  await t.test('GET /api/v2/devices requires admin auth and hides secrets', async () => {
    // 1. Without Admin Token -> 403
    const unauthRes = await makeRequest('GET', '/api/v2/devices', { 'X-Admin-Token': 'wrong-token' });
    assert.strictEqual(unauthRes.status, 403);

    // 2. With Admin Token -> 200 and hides secrets
    const res = await makeRequest('GET', '/api/v2/devices', {
      'Authorization': 'Bearer ' + appCtx.adminToken
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.devices.length, 1);
    assert.strictEqual(res.body.devices[0].deviceId, 'http-dev-1');
    assert.strictEqual(res.body.devices[0].credentialHash, undefined);
    assert.strictEqual(res.body.devices[0].deviceToken, undefined);
  });

  await t.test('Debug endpoint returns 404 in production mode and 200 in test mode', async () => {
    // 1. Production Mode -> 404
    const prodAppCtx = createApplication({ dataDir: makeTmpDir('prod-app') });
    const prodServer = http.createServer((req, res) => prodAppCtx.app(req, res));
    await new Promise((resolve) => prodServer.listen(0, '127.0.0.1', resolve));
    const prodPort = prodServer.address().port;

    const prodRes = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${prodPort}/debug/pin-state.json`, (res) => {
        resolve(res.statusCode);
      });
    });
    prodServer.close();
    assert.strictEqual(prodRes, 404, 'Debug endpoint must return 404 when ENABLE_TEST_ENDPOINTS is not set');

    // 2. Test Mode (ENABLE_TEST_ENDPOINTS=true) -> 200
    const originalEnv = process.env.ENABLE_TEST_ENDPOINTS;
    process.env.ENABLE_TEST_ENDPOINTS = 'true';
    const testAppCtx = createApplication({ dataDir: makeTmpDir('test-app') });
    const testServer = http.createServer((req, res) => testAppCtx.app(req, res));
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const testPort = testServer.address().port;

    const testRes = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${testPort}/debug/pin-state.json`, (res) => {
        resolve(res.statusCode);
      });
    });
    testServer.close();
    if (originalEnv === undefined) delete process.env.ENABLE_TEST_ENDPOINTS;
    else process.env.ENABLE_TEST_ENDPOINTS = originalEnv;

    assert.strictEqual(testRes, 200, 'Debug endpoint must return 200 when ENABLE_TEST_ENDPOINTS=true');
  });
});
