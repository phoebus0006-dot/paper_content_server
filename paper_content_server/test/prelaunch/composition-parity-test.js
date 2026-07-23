#!/usr/bin/env node
// composition-parity-test.js — Tests 100% object identity parity and path consistency across bootstrap & request context (R2-05, R2-06, R2-07, R2-08)

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var { bootstrap } = require('../../src/app/bootstrap');
var { buildRequestContext } = require('../../src/app/build-request-context');
var { createApplication } = require('../../src/app-factory');

var dataDir = path.join(__dirname, '..', '..', 'qa', 'runtime', 'parity-test-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });

var testEnv = Object.assign({}, process.env, { DATA_DIR: dataDir });

var boot = bootstrap({
  env: testEnv,
  cwd: path.join(__dirname, '..', '..'),
  listen: false,
});

var context = buildRequestContext(boot, { adminToken: 'test-token' });

// 1. Strict object identity parity checks
assert.strictEqual(context.snapshotStore, boot.deps.snapshotStore, 'snapshotStore identity parity');
assert.strictEqual(context.snapshotCache, boot.deps.snapshotCache, 'snapshotCache identity parity');
assert.strictEqual(context.pinStore, boot.deps.pinStore, 'pinStore identity parity');
assert.strictEqual(context.publicationLock, boot.deps.publicationLock, 'publicationLock identity parity');
assert.strictEqual(context.operatingModeService, boot.deps.operatingModeService, 'operatingModeService identity parity');
assert.strictEqual(context.publicationHistory, boot.deps.publicationHistory, 'publicationHistory identity parity');
assert.strictEqual(context.notificationPort, boot.deps.notificationPort, 'notificationPort identity parity');

assert.strictEqual(context.publicationService, boot.services.publicationService, 'publicationService identity parity');
assert.strictEqual(context.adminQueryService, boot.services.adminQueryService, 'adminQueryService identity parity');
assert.strictEqual(context.adminStateService, boot.services.adminStateService, 'adminStateService identity parity');
assert.strictEqual(context.newsTitleService, boot.services.newsTitleService, 'newsTitleService identity parity');
assert.strictEqual(context.safeImagePath, boot.services.safeImagePath, 'safeImagePath identity parity');
assert.strictEqual(context.imageRasterizer, boot.services.imageRasterizer, 'imageRasterizer identity parity');
assert.strictEqual(context.imageRecipeService, boot.services.imageRecipeService, 'imageRecipeService identity parity');
assert.strictEqual(context.deviceRegistryService, boot.services.deviceRegistryService, 'deviceRegistryService identity parity');
assert.strictEqual(context.overridePersistence, boot.services.overridePersistence, 'overridePersistence identity parity');
assert.strictEqual(context.assetRepository, boot.services.assetRepository, 'assetRepository identity parity');

// 2. Strict config path parity checks
assert.strictEqual(context.DATA_DIR, boot.config.paths.dataDir, 'DATA_DIR path parity');
assert.strictEqual(context.IMAGE_INDEX_FILE, boot.config.paths.imageIndexFile, 'IMAGE_INDEX_FILE path parity');
assert.strictEqual(context.LIBRARY_STATE_FILE, boot.config.paths.libraryStateFile, 'LIBRARY_STATE_FILE path parity');
assert.strictEqual(context.NEWS_CACHE_FILE, boot.config.paths.newsCacheFile, 'NEWS_CACHE_FILE path parity');
assert.strictEqual(context.NEWS_ROTATION_FILE, boot.config.paths.newsRotationFile, 'NEWS_ROTATION_FILE path parity');
assert.strictEqual(context.FEEDS_FILE, boot.config.paths.feedsFile, 'FEEDS_FILE path parity');
assert.strictEqual(context.LAST_GOOD_NEWS_FILE, boot.config.paths.lastGoodNewsFile, 'LAST_GOOD_NEWS_FILE path parity');
assert.strictEqual(context.FALLBACK_STUDY_DIR, boot.config.paths.fallbackStudyDir, 'FALLBACK_STUDY_DIR path parity');

// 3. Test Service Override Injection in Composition Phase (R2-06)
var mockDeviceRegistry = { _isMock: true, provisioningEnabled: false };
var bootWithOverride = bootstrap({
  env: testEnv,
  cwd: path.join(__dirname, '..', '..'),
  listen: false,
  serviceOverrides: {
    deviceRegistryService: mockDeviceRegistry,
  },
});

var contextWithOverride = buildRequestContext(bootWithOverride, {});
assert.strictEqual(bootWithOverride.services.deviceRegistryService, mockDeviceRegistry, 'Override must flow into boot.services');
assert.strictEqual(contextWithOverride.deviceRegistryService, mockDeviceRegistry, 'Override must flow into context');
assert.strictEqual(contextWithOverride.deviceRegistryService, bootWithOverride.services.deviceRegistryService, 'Override identity parity');

// 4. Test app-factory creation using buildRequestContext
var appInstance = createApplication({ adminToken: 'factory-token' });
assert.strictEqual(appInstance.runtime.deviceRegistryService, appInstance.runtime.boot.services.deviceRegistryService, 'app-factory identity parity');
assert.strictEqual(appInstance.runtime.DATA_DIR, appInstance.runtime.boot.config.paths.dataDir, 'app-factory path parity');

appInstance.close().then(function() {
  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}
  console.log('ALL COMPOSITION PARITY TESTS PASSED.');
});
