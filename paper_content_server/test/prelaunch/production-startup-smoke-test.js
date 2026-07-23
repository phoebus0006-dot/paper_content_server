#!/usr/bin/env node
// production-startup-smoke-test.js — Production Startup & Context Composition Smoke Test (R4-07, R5-06, R6-06)

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

async function runSmokeTest() {
  console.log('--- Testing Production Startup Composition Pathway ---');

  // Test real module directly (R6-06)
  var prodBoot = await createProductionBootMod.createProductionBoot({
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

  // Verify exported function on server.js matches module export (R6-04, R6-06)
  assert.strictEqual(typeof serverMod.createProductionBoot, 'function', 'server.js MUST export createProductionBoot');
  assert.strictEqual(typeof serverMod.createApplication, 'function', 'server.js MUST export createApplication');

  // Modify field on runtime and verify context is identical object
  prodBoot.runtime.feeds = [{ title: 'Smoke Test Feed' }];
  assert.strictEqual(prodBoot.context.feeds, prodBoot.runtime.feeds, 'Mutating runtime must reflect in context (same object)');

  // Verify non-null core services
  assert.ok(prodBoot.context.snapshotStore, 'snapshotStore must be defined');
  assert.ok(prodBoot.context.publicationService, 'publicationService must be defined');
  assert.ok(prodBoot.context.deviceRegistryService, 'deviceRegistryService must be defined');
  assert.ok(prodBoot.context.adminStateService, 'adminStateService must be defined');

  // Verify config-driven settings (R4-08, R5-04, R6-05)
  assert.strictEqual(prodBoot.context.NEWS_REFRESH_MINUTES, 7, 'NEWS_REFRESH_MINUTES must be 7 from config/env');
  assert.strictEqual(prodBoot.context.TIMEZONE, 'UTC', 'TIMEZONE must be UTC');
  assert.strictEqual(prodBoot.context.adminTrustProxy, false, 'adminTrustProxy false must be preserved without fallback override');

  // Verify createApplication context enforcement (R4-06, R5-03, R6-02)
  assert.throws(function() {
    createApplicationMod.createApplication({});
  }, function(err) {
    return err && (err.code === 'CANONICAL_CONTEXT_REQUIRED' || /CANONICAL_CONTEXT_REQUIRED/.test(err.message));
  }, 'createApplication without context must throw CANONICAL_CONTEXT_REQUIRED');

  assert.throws(function() {
    serverMod.createApplication({});
  }, function(err) {
    return err && (err.code === 'CANONICAL_CONTEXT_REQUIRED' || /CANONICAL_CONTEXT_REQUIRED/.test(err.message));
  }, 'serverMod.createApplication without context must throw CANONICAL_CONTEXT_REQUIRED');

  var appResult = createApplicationMod.createApplication({ context: prodBoot.context });
  assert.ok(appResult.handler, 'createApplication with context must return handler');

  // Storage dir initialization
  await prodBoot.context.snapshotStore.ensureDirs();

  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}
  console.log('ALL PRODUCTION STARTUP SMOKE TESTS PASSED SUCCESSFULLY.');
}

runSmokeTest().catch(function(err) {
  console.error('PRODUCTION STARTUP SMOKE TEST FAILED:', err);
  process.exit(1);
});
