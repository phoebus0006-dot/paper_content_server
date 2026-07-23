#!/usr/bin/env node
// production-startup-smoke-test.js — Production Startup & Context Composition Smoke Test (R4-07, R5-06, R6-06, R7-07)

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var createProductionBootMod = require('../../src/app/create-production-boot');
var createApplicationMod = require('../../src/app/create-application');
var serverMod = require('../../server.js');

var dataDir = path.join(__dirname, '..', '..', 'qa', 'runtime', 'smoke-test-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });

var testEnv = Object.assign({}, process.env, {
  DATA_DIR: dataDir,
  ADMIN_TOKEN: 'smoke-test-token',
  NEWS_REFRESH_MINUTES: '7',
  TZ: 'UTC',
  TRUST_PROXY: 'false',
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

async function runSmokeTest() {
  console.log('--- Testing Production Startup Composition Pathway ---');

  // Test server wrapper automatically injects real handler (R7-02, R7-07)
  var prodBoot = await serverMod.createProductionBoot({
    env: testEnv,
    cwd: path.join(__dirname, '..', '..'),
    listen: false,
  });

  assert.ok(prodBoot, 'createProductionBoot must return boot object');
  assert.ok(prodBoot.context, 'boot.context must be defined and non-null');

  // Parity checks
  assert.strictEqual(prodBoot.runtime, prodBoot.context, 'prodBoot.runtime MUST BE prodBoot.context');
  assert.strictEqual(prodBoot.context, prodBoot.boot.context, 'boot.context identity parity');
  assert.strictEqual(prodBoot.app, prodBoot.boot.app, 'app identity parity');

  // R7-07: Test actual HTTP handler with GET /health/live
  var liveReq = { method: 'GET', url: '/health/live', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  var liveRes = createMockRes();
  await prodBoot.boot.app.handler(liveReq, liveRes);
  assert.strictEqual(liveRes.statusCode, 200, '/health/live status must be 200');
  assert.ok(liveRes.body.includes('"status":"ok"') || liveRes.body.includes('"ok"'), '/health/live response must return ok');
  assert.strictEqual(liveRes.body.includes('createApp: no handler configured'), false, 'MUST NOT be placeholder 500 handler');

  // R7-07: Test unknown path returns 404 (not 500 placeholder)
  var notFoundReq = { method: 'GET', url: '/definitely-not-found', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  var notFoundRes = createMockRes();
  await prodBoot.boot.app.handler(notFoundReq, notFoundRes);
  assert.strictEqual(notFoundRes.statusCode, 404, 'Unknown path must return 404');

  // R7-07: Test underlying createProductionBoot fail-closed behavior
  await assert.rejects(async function() {
    await createProductionBootMod.createProductionBoot({
      env: testEnv,
      cwd: path.join(__dirname, '..', '..'),
      listen: false,
    });
  }, function(err) {
    return err && (err.code === 'PRODUCTION_HANDLER_REQUIRED' || /PRODUCTION_HANDLER_REQUIRED/.test(err.message));
  }, 'createProductionBootMod without handler must throw PRODUCTION_HANDLER_REQUIRED');

  // Storage dir initialization
  await prodBoot.context.snapshotStore.ensureDirs();

  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}
  console.log('ALL PRODUCTION STARTUP SMOKE TESTS PASSED SUCCESSFULLY.');
}

runSmokeTest().catch(function(err) {
  console.error('PRODUCTION STARTUP SMOKE TEST FAILED:', err);
  process.exit(1);
});
