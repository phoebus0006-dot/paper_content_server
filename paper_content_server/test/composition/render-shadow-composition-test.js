#!/usr/bin/env node
// render-shadow-composition-test.js — Verifies the production composition
// root wires render-shadow with two DISTINCT function objects (legacy and
// orchestrator), so createRenderShadow's "must be different functions" guard
// does not reject the composition.
//
// Tests:
//   RENDER_SHADOW_COMPOSES_WITH_FLAG_ON — composeServices with the flag on
//     produces a non-null renderShadow instance.
//   LEGACY_AND_ORCHESTRATOR_DIFFERENT — the dual-closure pattern
//     compose-services uses (two function objects sharing one body) is accepted
//     by createRenderShadow; passing the same function twice still throws.
//   FEATURE_VIEW_RENDER_SHADOW_READY — featureFlagView reports the render
//     shadow feature as ready (configured && connected).
//   SHADOW_RUNS_THROUGH_COMPOSITION_ROOT — invoking renderShadow.run via the
//     composition root does not throw and yields a real EPF1 frame.
var path = require('path');
var fs = require('fs');
var os = require('os');

var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var composeServices = require(path.join(ROOT, 'src', 'app', 'compose-services')).composeServices;
var { createRenderShadow } = require(path.join(ROOT, 'src', 'render', 'render-shadow'));

// --- Temp data dir so assetRepository / tombstones do not collide with the repo ---
var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-shadow-comp-'));
var dataDir = path.join(tmpRoot, 'data');
fs.mkdirSync(dataDir, { recursive: true });

var logger = { info: function () {}, warn: function (m) { warnLog.push(m); }, error: function () {} };
var warnLog = [];

// Minimal stubs — composeServices only stores these in PublicationService and
// passes them through; nothing invokes them during initialization.
var snapshotStoreStub = { readActiveSync: function () { return null; }, readActive: function () { return Promise.resolve(null); }, load: function () { return Promise.resolve(null); } };
var snapshotCacheStub = { keys: function () { return []; }, get: function () { return null; }, set: function () {}, delete: function () {} };
var pinStoreStub = {};
var publicationLockStub = { acquire: function () { return Promise.resolve(function () {}); } };
var operatingModeServiceStub = {};
var publicationHistoryStub = { list: function () { return Promise.resolve([]); }, append: function () { return Promise.resolve(); } };
var notificationPortStub = {};

var config = {
  features: {
    renderShadowEnabled: true,
    deletePipelineEnabled: false,
    customLibraryEnabled: false,
    learningLibraryEnabled: false,
    mqttEnabled: false,
  },
  paths: { dataDir: dataDir },
  translation: { provider: 'none' },
  safety: {},
};

var deps = {
  config: config,
  clock: { nowMs: function () { return 1; } },
  logger: logger,
  stores: {},
  httpClient: null,
  snapshotStore: snapshotStoreStub,
  snapshotCache: snapshotCacheStub,
  pinStore: pinStoreStub,
  publicationLock: publicationLockStub,
  operatingModeService: operatingModeServiceStub,
  publicationHistory: publicationHistoryStub,
  notificationPort: notificationPortStub,
  mqttClient: null,
};

async function run() {
  // === 1. composeServices with flag on -> renderShadow non-null ===
  var services;
  try {
    services = composeServices(deps);
  } catch (e) {
    t('RENDER_SHADOW_COMPOSES_WITH_FLAG_ON', false, 'composeServices threw: ' + e.message);
    throw e;
  }
  t('RENDER_SHADOW_COMPOSES_WITH_FLAG_ON', !!services.renderShadow, 'renderShadow=' + services.renderShadow);

  // Verify no "must be different functions" warning was logged — that warning
  // would mean composeServices passed the same function reference and the
  // outer try/catch swallowed the throw (legacy behavior pre-fix).
  var diffFnWarn = warnLog.some(function (m) { return String(m).indexOf('different functions') >= 0; });
  t('RENDER_SHADOW_NO_DIFFERENT_FUNCTIONS_WARNING', !diffFnWarn, 'warn=' + warnLog.join('; '));

  // === 2. legacy and orchestrator are different function objects ===
  // composeServices does not expose the two closures, so verify the contract
  // directly: createRenderShadow accepts two distinct closures with identical
  // bodies, and rejects the same function reference.
  var accepted = false;
  try {
    createRenderShadow(
      function (c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(4) }); },
      function (c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(4) }); },
      { warn: function () {} }
    );
    accepted = true;
  } catch (e) {
    accepted = false;
  }
  t('LEGACY_AND_ORCHESTRATOR_DIFFERENT', accepted, 'distinct closures must be accepted');

  // Counter-test: same function reference must still throw (guard intact).
  var sameFn = function (c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(4) }); };
  var sameThrew = false;
  try {
    createRenderShadow(sameFn, sameFn, { warn: function () {} });
  } catch (e) {
    sameThrew = String(e.message || '').indexOf('different functions') >= 0;
  }
  t('LEGACY_AND_ORCHESTRATOR_GUARD_INTACT', sameThrew, 'same-reference must throw');

  // === 3. featureFlagView reports render shadow ready ===
  var flags = services.featureFlagView.getFeatureFlags();
  t('FEATURE_VIEW_RENDER_SHADOW_READY',
    flags.renderShadow && flags.renderShadow.ready === true && flags.renderShadow.configured === true && flags.renderShadow.connected === true,
    'ready=' + flags.renderShadow.ready + ' reason=' + flags.renderShadow.reason);

  // === 4. shadow runs through composition root without throwing ===
  // Use a content shape analysisRenderer.canRender accepts (title + items).
  var content = { title: 'Composition Root Test', items: [{ title: 'A' }, { title: 'B' }] };
  var result;
  try {
    result = await services.renderShadow.run(content, 'default-v1', 'comp-clock');
  } catch (e) {
    t('SHADOW_RUNS_THROUGH_COMPOSITION_ROOT', false, 'run threw: ' + e.message);
    throw e;
  }
  t('SHADOW_RUNS_THROUGH_COMPOSITION_ROOT',
    !!result && Buffer.isBuffer(result.frame) && result.frame.length > 0,
    'frameLen=' + (result && result.frame ? result.frame.length : 0));

  // The shadow records a mismatch when legacy and orchestrator use genuinely
  // independent adapters (legacy = color-block fills, orchestrator = real text
  // rasterizers). A mismatch is the expected, meaningful outcome — it proves
  // the two pipelines are truly independent rather than two closures over one
  // shared function.
  var metrics = services.renderShadow.getMetrics();
  t('SHADOW_MISMATCH_RECORDED', metrics.runs >= 1 && metrics.mismatches >= 1, 'runs=' + metrics.runs + ' mismatches=' + metrics.mismatches);

  // Cleanup temp dir.
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function (e) {
  console.log('CRASH: ' + (e && e.message ? e.message : e));
  console.log(e && e.stack ? e.stack : '');
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
