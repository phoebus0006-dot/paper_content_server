const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { DeviceRegistryService, ONLINE_TIMEOUT_MS } = require('../../src/devices/device-registry-service');
const { JsonStore } = require('../../src/infra/json-store');
const { createApplication, createHandler } = require('../../src/app-factory');

const tmpDir = path.join(__dirname, '..', '..', 'test_temp', 'device-registry-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

test('DeviceRegistryService — Unit Tests', async (t) => {
  const jsonPath = path.join(tmpDir, 'devices-unit.json');
  let mockNow = 1000000;
  const mockClock = { nowMs: () => mockNow };
  const jsonStore = new JsonStore(jsonPath, { schemaVersion: 1 });
  const service = new DeviceRegistryService({ jsonStore, clock: mockClock });

  await t.test('initial list is empty', async () => {
    const list = await service.listDevices();
    assert.deepStrictEqual(list, []);
  });

  await t.test('register and heartbeat new device', async () => {
    const dev1 = await service.heartbeat('esp32-livingroom', {
      firmwareVersion: 'v0.9.0',
      ip: '192.168.1.101',
      rssi: -65,
      battery: 98,
      currentFrame: 'frame-news-001',
      contentMode: 'news'
    });

    assert.strictEqual(dev1.deviceId, 'esp32-livingroom');
    assert.strictEqual(dev1.firmware, 'v0.9.0');
    assert.strictEqual(dev1.ip, '192.168.1.101');
    assert.strictEqual(dev1.status, 'online');
    assert.strictEqual(dev1.currentFrame, 'frame-news-001');
    assert.strictEqual(dev1.contentMode, 'news');
    assert.strictEqual(dev1.rssi, -65);
    assert.strictEqual(dev1.battery, 98);
  });

  await t.test('heartbeat updates existing device without overwriting unchanged values', async () => {
    mockNow += 60000; // +1 minute
    const dev1Updated = await service.heartbeat('esp32-livingroom', {
      rssi: -70,
      currentFrame: 'frame-news-002'
    });

    assert.strictEqual(dev1Updated.deviceId, 'esp32-livingroom');
    assert.strictEqual(dev1Updated.firmware, 'v0.9.0'); // preserved
    assert.strictEqual(dev1Updated.ip, '192.168.1.101'); // preserved
    assert.strictEqual(dev1Updated.rssi, -70); // updated
    assert.strictEqual(dev1Updated.currentFrame, 'frame-news-002'); // updated
    assert.strictEqual(dev1Updated.status, 'online');
  });

  await t.test('multi-device isolation', async () => {
    await service.heartbeat('esp32-study', {
      firmwareVersion: 'v0.9.0',
      ip: '192.168.1.102',
      contentMode: 'photo'
    });

    const list = await service.listDevices();
    assert.strictEqual(list.length, 2);

    const living = await service.getDevice('esp32-livingroom');
    const study = await service.getDevice('esp32-study');

    assert.strictEqual(living.deviceId, 'esp32-livingroom');
    assert.strictEqual(living.contentMode, 'news');
    assert.strictEqual(study.deviceId, 'esp32-study');
    assert.strictEqual(study.contentMode, 'photo');
  });

  await t.test('online / offline status calculation (> 5 mins is offline)', async () => {
    // Advance clock by 6 minutes (360,000 ms)
    mockNow += 360000;

    const living = await service.getDevice('esp32-livingroom');
    assert.strictEqual(living.status, 'offline');

    // Heartbeat brings it back online
    await service.heartbeat('esp32-livingroom', { rssi: -60 });
    const livingOnline = await service.getDevice('esp32-livingroom');
    assert.strictEqual(livingOnline.status, 'online');
  });

  await t.test('data persistence across service instances', async () => {
    const service2 = new DeviceRegistryService({ jsonStore, clock: mockClock });
    const list = await service2.listDevices();
    assert.strictEqual(list.length, 2);
    const study = await service2.getDevice('esp32-study');
    assert.strictEqual(study.ip, '192.168.1.102');
  });
});

test('Device Registry HTTP API — Integration Tests', async (t) => {
  const appCtx = createApplication({ adminToken: 'test-token' });
  const handler = appCtx.app;
  const server = http.createServer(handler);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  await t.test('POST /api/v2/devices/:deviceId/heartbeat registers and updates device', async () => {
    const res = await fetch(`${baseUrl}/api/v2/devices/esp32-kitchen/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firmwareVersion: 'v0.9.0-core',
        ip: '192.168.1.150',
        rssi: -55,
        battery: 100,
        currentFrame: 'frame-photo-999',
        contentMode: 'photo'
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.device.deviceId, 'esp32-kitchen');
    assert.strictEqual(body.device.firmware, 'v0.9.0-core');
    assert.strictEqual(body.device.status, 'online');
  });

  await t.test('GET /api/v2/devices lists all devices', async () => {
    const res = await fetch(`${baseUrl}/api/v2/devices`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.devices));
    assert.strictEqual(body.devices.length, 1);
    assert.strictEqual(body.devices[0].deviceId, 'esp32-kitchen');
  });

  await t.test('GET /api/v2/devices/:id gets single device', async () => {
    const res = await fetch(`${baseUrl}/api/v2/devices/esp32-kitchen`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.device.deviceId, 'esp32-kitchen');
    assert.strictEqual(body.device.ip, '192.168.1.150');
  });

  await t.test('GET /api/v2/devices/:id returns 404 for unknown device', async () => {
    const res = await fetch(`${baseUrl}/api/v2/devices/non-existent-device`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'DEVICE_NOT_FOUND');
  });
});
