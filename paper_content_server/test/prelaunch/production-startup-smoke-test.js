#!/usr/bin/env node
// production-startup-smoke-test.js — Production Startup & Context Composition Smoke Test (R4-04, R4-05, R4-06, R4-07)

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var serverMod = require('../../server.js');

var dataDir = path.join(__dirname, '..', '..', 'qa', 'runtime', 'smoke-test-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });

var testEnv = Object.assign({}, process.env, {
  DATA_DIR: dataDir,
  ADMIN_TOKEN: 'smoke-test-token',
  NEWS_REFRESH_MINUTES: '7',
  TZ: 'UTC',
});

async function runSmokeTest() {
  console.log('--- Testing Production Startup Composition Pathway ---');

  var prodBoot = await serverMod.createProductionBoot({
    env: testEnv,
    cwd: path.join(__dirname, '..', '..'),
    listen: false,
  });

  assert.ok(prodBoot, 'createProductionBoot must return boot object');
  assert.ok(prodBoot.context, 'boot.context must be defined and non-null');
  assert.strictEqual(prodBoot.context, prodBoot.boot.context, 'Context identity parity');

  // Verify non-null core services
  assert.ok(prodBoot.context.snapshotStore, 'snapshotStore must be defined');
  assert.ok(prodBoot.context.publicationService, 'publicationService must be defined');
  assert.ok(prodBoot.context.deviceRegistryService, 'deviceRegistryService must be defined');
  assert.ok(prodBoot.context.adminStateService, 'adminStateService must be defined');

  // Verify config-driven settings (R4-08)
  assert.strictEqual(prodBoot.context.NEWS_REFRESH_MINUTES, 7, 'NEWS_REFRESH_MINUTES must be 7 from config/env');
  assert.strictEqual(prodBoot.context.TIMEZONE, 'UTC', 'TIMEZONE must be UTC');

  // Verify createApplication context enforcement (R4-06)
  assert.throws(function() {
    serverMod.createApplication({});
  }, /CANONICAL_CONTEXT_REQUIRED/, 'createApplication without context must throw CANONICAL_CONTEXT_REQUIRED');

  var appResult = serverMod.createApplication({ context: prodBoot.context });
  assert.ok(appResult.handler, 'createApplication with context must return handler');

  // Minimal storage dir verification
  await prodBoot.context.snapshotStore.ensureDirs();

  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}
  console.log('ALL PRODUCTION STARTUP SMOKE TESTS PASSED SUCCESSFULLY.');
}

runSmokeTest().catch(function(err) {
  console.error('PRODUCTION STARTUP SMOKE TEST FAILED:', err);
  process.exit(1);
});
