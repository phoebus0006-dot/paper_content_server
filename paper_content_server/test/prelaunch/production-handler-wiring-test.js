#!/usr/bin/env node
// production-handler-wiring-test.js — Production Handler Wiring & Fail-Closed Test (R7-08, R7-09)

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var createProductionBootMod = require('../../src/app/create-production-boot');
var createApplicationMod = require('../../src/app/create-application');
var serverMod = require('../../server.js');

var dataDir = path.join(__dirname, '..', '..', 'qa', 'runtime', 'wiring-test-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });

var testEnv = Object.assign({}, process.env, {
  DATA_DIR: dataDir,
  ADMIN_TOKEN: 'wiring-test-token',
  NEWS_REFRESH_MINUTES: '5',
  TZ: 'UTC',
});

function createMockRes() {
  var res = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    writeHead: function(status, headers) {
      res.statusCode = status;
      if (headers) Object.assign(res.headers, headers);
    },
    setHeader: function(k, v) {
      res.headers[k] = v;
    },
    end: function(chunk) {
      if (chunk) res.body += chunk.toString();
      res.ended = true;
    }
  };
  return res;
}

async function runWiringTest() {
  console.log('--- Running Production Handler Wiring Tests ---');

  // 1. Fail closed check
  await assert.rejects(async function() {
    await createProductionBootMod.createProductionBoot({
      env: testEnv,
      cwd: path.join(__dirname, '..', '..'),
      listen: false,
    });
  }, function(err) {
    return err && (err.code === 'PRODUCTION_HANDLER_REQUIRED' || /PRODUCTION_HANDLER_REQUIRED/.test(err.message));
  }, 'createProductionBoot without handler must throw PRODUCTION_HANDLER_REQUIRED');

  // 2. Server wrapper auto-injection check
  var prod = await serverMod.createProductionBoot({
    env: testEnv,
    cwd: path.join(__dirname, '..', '..'),
    listen: false,
  });

  assert.ok(prod, 'createProductionBoot must return boot object');
  assert.strictEqual(typeof prod.boot.app.handler, 'function', 'boot.app.handler must be a function');
  assert.strictEqual(prod.runtime, prod.context, 'prod.runtime === prod.context');
  assert.strictEqual(prod.context, prod.boot.context, 'prod.context === prod.boot.context');

  // 3. /health/live HTTP request check
  var liveReq = { method: 'GET', url: '/health/live', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  var liveRes = createMockRes();
  await prod.boot.app.handler(liveReq, liveRes);
  assert.strictEqual(liveRes.statusCode, 200, '/health/live status must be 200');
  assert.ok(liveRes.body.includes('ok'), '/health/live body must include ok');
  assert.strictEqual(liveRes.body.includes('createApp: no handler configured'), false, 'MUST NOT be 500 placeholder');

  // 4. Unknown route 404 check
  var notFoundReq = { method: 'GET', url: '/unknown-route-xyz', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  var notFoundRes = createMockRes();
  await prod.boot.app.handler(notFoundReq, notFoundRes);
  assert.strictEqual(notFoundRes.statusCode, 404, 'Unknown path must return 404');

  // 5. Static AST/Structure Checks on server.js (R7-09)
  var serverSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  var createAppMatches = serverSrc.match(/function\s+createApplication\s*\(/g) || [];
  assert.strictEqual(createAppMatches.length, 1, 'server.js must contain exactly ONE createApplication declaration');
  assert.strictEqual(serverSrc.includes('Object.assign({}, runtime'), false, 'server.js must NOT contain Object.assign({}, runtime');

  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}
  console.log('ALL PRODUCTION HANDLER WIRING TESTS PASSED SUCCESSFULLY.');
}

runWiringTest().catch(function(err) {
  console.error('PRODUCTION HANDLER WIRING TEST FAILED:', err);
  process.exit(1);
});
