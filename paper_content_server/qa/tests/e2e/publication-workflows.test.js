const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApplication } = require('../../../src/app-factory');

describe('E2E — server.bootstrap', () => {
  let factory;
  let server;
  let baseUrl;
  let tmpDataDir;

  before(async () => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-bootstrap-e2e-'));
    factory = createApplication({
      dataDir: tmpDataDir,
      imageDir: path.join(tmpDataDir, 'images')
    });
    await factory.ensureInitialized();

    await new Promise((resolve) => {
      server = http.createServer(factory.app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (factory && factory.close) {
      await factory.close();
    }
    try {
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch (e) {}
  });

  it('bootstraps server and verifies health and admin endpoints', async () => {
    const healthRes = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/api/health.json`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });

    assert.strictEqual(healthRes.status, 200);
    const healthJson = JSON.parse(healthRes.body);
    assert.strictEqual(healthJson.status, 'ok');

    const stateRes = await new Promise((resolve, reject) => {
      const u = new URL(`${baseUrl}/api/admin/state`);
      const req = http.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        headers: { 'authorization': `Bearer ${factory.adminToken}` }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(stateRes.status, 200);
    const stateJson = JSON.parse(stateRes.body);
    assert.ok(stateJson.active, 'state must have active property');
    assert.ok(stateJson.active || stateJson.mode || stateJson.status, 'state must have active or mode');
  });
});
