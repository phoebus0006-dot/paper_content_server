#!/usr/bin/env node
// feature-flag-truth-test.js — verifies the 5-dimension feature flag truth model.
//
// Dimensions under test (per src/admin/feature-flag-view.js):
//   configured / enabled / connected / ready / reason
//
// Truth rule: ready === configured && connected
//   - configured=false            → reason = 'FEATURE_DISABLED'
//   - configured=true, connected=false → reason = <specific dependency code>
//   - configured=true, connected=true  → reason = null
//
// Classifier-aware truth (customLibrary / learning):
//   ready requires the safety classifier port to exist AND be ready (port.ready === true,
//   i.e. inference is actually usable — NOT merely port.configured which only means a
//   modelPath was provided). When classifier is not ready, reason = 'SAFETY_CLASSIFIER_NOT_READY'.
//
// deletePipeline truth:
//   connected = !!assetDeleteService (the real delete service instance).
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var FV = require(path.join(ROOT, 'src', 'admin', 'feature-flag-view'));
var { loadConfig } = require(path.join(ROOT, 'src', 'config', 'load-config'));

var pass = 0, fail = 0, ec = 0;
function t(n, ok, d) {
  console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}
function eq(n, actual, expected) {
  var ok = actual === expected;
  t(n, ok, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// config with all feature flags defaulting to false (fail-closed), overridden by `over`.
function makeConfig(over) {
  return { features: Object.assign({
    customLibraryEnabled: false,
    learningLibraryEnabled: false,
    advancedRenderEnabled: false,
    renderShadowEnabled: false,
    deletePipelineEnabled: false,
    mqttEnabled: false,
  }, over || {}) };
}

// loadConfig with safe baseline env (so validation noise doesn't interfere).
function cfg(env) {
  return loadConfig({ env: Object.assign({ PORT: '8787', TRANSLATION_PROVIDER: 'none', TZ: 'UTC' }, env) });
}

var FAKE_MQTT = { isConnected: function() { return true; } };
var FAKE_NEWS = { name: 'news' };
var FAKE_CUSTOM = { name: 'custom' };
var FAKE_LEARNING = { name: 'learning' };
var FAKE_SHADOW = { name: 'shadow' };
var FAKE_DELETE = { name: 'delete' };
// classifier port that is fully ready — simulates a classifier with working inference
// (configured=true AND ready=true). The ready=true path is only reachable with a real
// inference implementation; this stub exercises the propagation logic.
var CLASSIFIER_READY = { configured: true, ready: true };
// classifier port that exists but has no model loaded — simulates fail-closed.
var CLASSIFIER_NO_MODEL = { configured: false, ready: false };
// classifier stub: modelPath provided + file exists (configured=true), but no real
// inference (ready=false). This is the CURRENT real state when a user sets
// NSFW_MODEL_PATH to an existing file — truth must be ready=false.
var CLASSIFIER_STUB = { configured: true, ready: false };

// Feature keys that carry the 5-dimension shape.
// adminReadOnly is constant-true; activeFrameId is a passthrough scalar; classifier is
// driven by the port and is exercised in dedicated cases below.
var FEATURE_KEYS = ['mqtt','newsPipeline','customLibrary','learning','advancedRender','renderShadow','deletePipeline'];

console.log('=== Feature Flag Truth Model Test ===');

// ─── Case 1: all flags false → every feature ready=false, reason=FEATURE_DISABLED ───
//      deletePipeline.connected = !!assetDeleteService → false when service absent.
(function() {
  var flags = FV.getFeatureFlags({ config: makeConfig() });
  FEATURE_KEYS.forEach(function(k) {
    eq('CASE1_' + k + '_CONFIGURED', flags[k].configured, false);
    eq('CASE1_' + k + '_ENABLED', flags[k].enabled, false);
    eq('CASE1_' + k + '_READY', flags[k].ready, false);
    eq('CASE1_' + k + '_REASON', flags[k].reason, 'FEATURE_DISABLED');
  });
  // deletePipeline no longer hard-codes connected=true — it tracks the real service.
  eq('CASE1_DELETE_PIPELINE_CONNECTED', flags.deletePipeline.connected, false);
})();

// ─── Case 2: CUSTOM_LIBRARY_ENABLED=true but classifier not ready → ready=false,
//              reason=SAFETY_CLASSIFIER_NOT_READY (even with the service present). ───
(function() {
  // 2a: no classifier port at all, no service
  var flags2a = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true }),
  });
  eq('CASE2A_CUSTOM_CONFIGURED', flags2a.customLibrary.configured, true);
  eq('CASE2A_CUSTOM_ENABLED', flags2a.customLibrary.enabled, true);
  eq('CASE2A_CUSTOM_CONNECTED', flags2a.customLibrary.connected, false);
  eq('CASE2A_CUSTOM_READY', flags2a.customLibrary.ready, false);
  // The service is missing first, so the reason identifies the service, not the classifier.
  eq('CASE2A_CUSTOM_REASON', flags2a.customLibrary.reason, 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED');

  // 2b: service present, but classifier port missing entirely
  var flags2b = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true }),
    customLibraryService: FAKE_CUSTOM,
  });
  eq('CASE2B_CUSTOM_CONNECTED', flags2b.customLibrary.connected, false);
  eq('CASE2B_CUSTOM_READY', flags2b.customLibrary.ready, false);
  eq('CASE2B_CUSTOM_REASON', flags2b.customLibrary.reason, 'SAFETY_CLASSIFIER_NOT_READY');

  // 2c: service present, classifier port exists but NOT configured (no model)
  var flags2c = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true }),
    customLibraryService: FAKE_CUSTOM,
    safetyClassifierPort: CLASSIFIER_NO_MODEL,
  });
  eq('CASE2C_CUSTOM_CONNECTED', flags2c.customLibrary.connected, false);
  eq('CASE2C_CUSTOM_READY', flags2c.customLibrary.ready, false);
  eq('CASE2C_CUSTOM_REASON', flags2c.customLibrary.reason, 'SAFETY_CLASSIFIER_NOT_READY');
})();

// ─── Case 3: CUSTOM_LIBRARY_ENABLED=true AND classifier ready AND service present → ready=true ───
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true }),
    customLibraryService: FAKE_CUSTOM,
    safetyClassifierPort: CLASSIFIER_READY,
  });
  eq('CASE3_CUSTOM_CONFIGURED', flags.customLibrary.configured, true);
  eq('CASE3_CUSTOM_ENABLED', flags.customLibrary.enabled, true);
  eq('CASE3_CUSTOM_CONNECTED', flags.customLibrary.connected, true);
  eq('CASE3_CUSTOM_READY', flags.customLibrary.ready, true);
  eq('CASE3_CUSTOM_REASON', flags.customLibrary.reason, null);
  // learning behaves the same way (classifier-gated)
  var lflags = FV.getFeatureFlags({
    config: makeConfig({ learningLibraryEnabled: true }),
    learningIngestionService: FAKE_LEARNING,
    safetyClassifierPort: CLASSIFIER_READY,
  });
  eq('CASE3_LEARNING_READY', lflags.learning.ready, true);
  eq('CASE3_LEARNING_REASON', lflags.learning.reason, null);
})();

// ─── Case 4: MQTT_ENABLED=false but mqttClient present → ready=false (configured=false) ───
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({ mqttEnabled: false }),
    mqttClient: FAKE_MQTT,
  });
  eq('CASE4_MQTT_CONFIGURED', flags.mqtt.configured, false);
  eq('CASE4_MQTT_ENABLED', flags.mqtt.enabled, false);
  // connected is true (instance exists) — but ready must still be false because not configured
  eq('CASE4_MQTT_CONNECTED', flags.mqtt.connected, true);
  eq('CASE4_MQTT_READY', flags.mqtt.ready, false);
  eq('CASE4_MQTT_REASON', flags.mqtt.reason, 'FEATURE_DISABLED');
})();

// ─── Case 5: all 5 dimensions present, correct types, and invariants hold ───
//      All deps + classifier + deleteService present → all FEATURE_KEYS ready=true.
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({
      customLibraryEnabled: true,
      mqttEnabled: true,
      learningLibraryEnabled: true,
      advancedRenderEnabled: true,
      renderShadowEnabled: true,
      deletePipelineEnabled: true,
    }),
    mqttClient: FAKE_MQTT,
    newsPipeline: FAKE_NEWS,
    customLibraryService: FAKE_CUSTOM,
    learningIngestionService: FAKE_LEARNING,
    renderShadow: FAKE_SHADOW,
    assetDeleteService: FAKE_DELETE,
    safetyClassifierPort: CLASSIFIER_READY,
    activeFrameIdProvider: function() { return 'frame-7'; },
  });
  FEATURE_KEYS.forEach(function(k) {
    t('CASE5_' + k + '_CONFIGURED_IS_BOOL', typeof flags[k].configured === 'boolean', '');
    t('CASE5_' + k + '_ENABLED_IS_BOOL', typeof flags[k].enabled === 'boolean', '');
    t('CASE5_' + k + '_CONNECTED_IS_BOOL', typeof flags[k].connected === 'boolean', '');
    t('CASE5_' + k + '_READY_IS_BOOL', typeof flags[k].ready === 'boolean', '');
    t('CASE5_' + k + '_REASON_IS_NULL_OR_STRING',
      flags[k].reason === null || typeof flags[k].reason === 'string', '');
    // Invariant: configured === enabled for boolean flags
    t('CASE5_' + k + '_CONFIGURED_EQUALS_ENABLED', flags[k].configured === flags[k].enabled, '');
    // Invariant: ready === configured && connected
    t('CASE5_' + k + '_READY_IS_AND', flags[k].ready === (flags[k].configured && flags[k].connected), '');
    // All deps present + configured → ready=true, reason=null
    t('CASE5_' + k + '_READY_TRUE', flags[k].ready === true, k + ' should be ready');
    t('CASE5_' + k + '_REASON_NULL', flags[k].reason === null, k + ' ready → null reason');
  });
  // adminReadOnly is a constant always-ready flag (no 5-dim computation).
  t('CASE5_ADMIN_READONLY_CONFIGURED', flags.adminReadOnly.configured === true, '');
  t('CASE5_ADMIN_READONLY_ENABLED', flags.adminReadOnly.enabled === true, '');
  t('CASE5_ADMIN_READONLY_CONNECTED', flags.adminReadOnly.connected === true, '');
  t('CASE5_ADMIN_READONLY_READY', flags.adminReadOnly.ready === true, '');
  t('CASE5_ADMIN_READONLY_REASON', flags.adminReadOnly.reason === null, '');
  // activeFrameId passthrough preserved (backward compatibility).
  eq('CASE5_ACTIVE_FRAME_ID', flags.activeFrameId, 'frame-7');
  // Result object is frozen (single source of truth, not mutable by callers).
  t('CASE5_FROZEN', Object.isFrozen(flags), '');
  t('CASE5_HAS_RENDER_SHADOW_KEY', Object.prototype.hasOwnProperty.call(flags, 'renderShadow'), '');
  t('CASE5_HAS_CLASSIFIER_KEY', Object.prototype.hasOwnProperty.call(flags, 'classifier'), '');
})();

// ─── Case 6: loadConfig integration — features default to false when env unset ───
//      Also verifies safety/learning/upload config blocks are present with correct defaults.
(function() {
  var c = cfg({});
  t('CASE6_FEATURES_BLOCK', typeof c.features === 'object' && c.features !== null, '');
  eq('CASE6_CUSTOM_LIBRARY_DEFAULT', c.features.customLibraryEnabled, false);
  eq('CASE6_LEARNING_DEFAULT', c.features.learningLibraryEnabled, false);
  eq('CASE6_ADVANCED_RENDER_DEFAULT', c.features.advancedRenderEnabled, false);
  eq('CASE6_RENDER_SHADOW_DEFAULT', c.features.renderShadowEnabled, false);
  eq('CASE6_DELETE_PIPELINE_DEFAULT', c.features.deletePipelineEnabled, false);
  eq('CASE6_MQTT_DEFAULT', c.features.mqttEnabled, false);

  // safety config block
  t('CASE6_SAFETY_BLOCK', typeof c.safety === 'object' && c.safety !== null, '');
  eq('CASE6_SAFETY_MODEL_PATH_DEFAULT', c.safety.modelPath, null);
  eq('CASE6_SAFETY_MODEL_TYPE_DEFAULT', c.safety.modelType, 'tensorflow');
  eq('CASE6_SAFETY_THRESHOLD_DEFAULT', c.safety.threshold, 0.5);
  t('CASE6_SAFETY_AUDIT_FILE_IS_STRING', typeof c.safety.auditFile === 'string' && c.safety.auditFile.length > 0, '');

  // learning config block
  t('CASE6_LEARNING_BLOCK', typeof c.learning === 'object' && c.learning !== null, '');
  eq('CASE6_LEARNING_SOURCE_ENABLED_DEFAULT', c.learning.sourceEnabled, false);
  t('CASE6_LEARNING_SOURCES_DEFAULT', Array.isArray(c.learning.sources) && c.learning.sources[0] === 'wikimedia', '');
  t('CASE6_LEARNING_TOPICS_DEFAULT_EMPTY', Array.isArray(c.learning.topics) && c.learning.topics.length === 0, '');
  eq('CASE6_LEARNING_INTERVAL_MS_DEFAULT', c.learning.intervalMs, 3600000);
  eq('CASE6_LEARNING_MAX_CANDIDATES_DEFAULT', c.learning.maxCandidates, 50);
  eq('CASE6_LEARNING_MAX_DOWNLOAD_BYTES_DEFAULT', c.learning.maxDownloadBytes, 20 * 1024 * 1024);
  eq('CASE6_LEARNING_REQUEST_TIMEOUT_MS_DEFAULT', c.learning.requestTimeoutMs, 10000);

  // upload config block
  t('CASE6_UPLOAD_BLOCK', typeof c.upload === 'object' && c.upload !== null, '');
  eq('CASE6_UPLOAD_MAX_BYTES_DEFAULT', c.upload.maxUploadBytes, 50 * 1024 * 1024);
  t('CASE6_UPLOAD_ALLOWED_MIME_TYPES',
    Array.isArray(c.upload.allowedMimeTypes) &&
    c.upload.allowedMimeTypes.length === 3 &&
    c.upload.allowedMimeTypes.indexOf('image/jpeg') >= 0 &&
    c.upload.allowedMimeTypes.indexOf('image/png') >= 0 &&
    c.upload.allowedMimeTypes.indexOf('image/webp') >= 0, '');
})();

// ─── Case 7: parseBoolEnv accepts true/1/yes (case-insensitive); rejects 0/no/false ───
//      Also verifies env-driven overrides for safety/learning/upload numeric configs.
(function() {
  var c = cfg({
    CUSTOM_LIBRARY_ENABLED: 'true',
    LEARNING_LIBRARY_ENABLED: '1',
    MQTT_ENABLED: 'yes',
    R9_ADVANCED_RENDER_ENABLED: 'TRUE',
    DELETE_PIPELINE_ENABLED: '0',
    R9_RENDER_SHADOW_ENABLED: 'no',
    NSFW_MODEL_PATH: '/models/nsfw.pb',
    NSFW_THRESHOLD: '0.85',
    LEARNING_INTERVAL_MS: '7200000',
    LEARNING_MAX_CANDIDATES: '100',
    LEARNING_TOPICS: 'cats,dogs,birds',
    MAX_UPLOAD_BYTES: '1048576',
  });
  eq('CASE7_CUSTOM_TRUE', c.features.customLibraryEnabled, true);
  eq('CASE7_LEARNING_ONE', c.features.learningLibraryEnabled, true);
  eq('CASE7_MQTT_YES', c.features.mqttEnabled, true);
  eq('CASE7_ADVANCED_RENDER_CAPS', c.features.advancedRenderEnabled, true);
  eq('CASE7_DELETE_ZERO_FALSE', c.features.deletePipelineEnabled, false);
  eq('CASE7_SHADOW_NO_FALSE', c.features.renderShadowEnabled, false);
  // safety overrides
  eq('CASE7_SAFETY_MODEL_PATH', c.safety.modelPath, '/models/nsfw.pb');
  eq('CASE7_SAFETY_THRESHOLD', c.safety.threshold, 0.85);
  // learning overrides
  eq('CASE7_LEARNING_INTERVAL_MS', c.learning.intervalMs, 7200000);
  eq('CASE7_LEARNING_MAX_CANDIDATES', c.learning.maxCandidates, 100);
  t('CASE7_LEARNING_TOPICS_PARSED',
    c.learning.topics.length === 3 &&
    c.learning.topics[0] === 'cats' &&
    c.learning.topics[2] === 'birds', '');
  // upload overrides
  eq('CASE7_UPLOAD_MAX_BYTES', c.upload.maxUploadBytes, 1048576);
})();

// ─── Case 8: newsPipeline has no env flag — configured is driven by instance presence ───
(function() {
  var without = FV.getFeatureFlags({ config: makeConfig() });
  eq('CASE8_NEWS_NO_INSTANCE_CONFIGURED', without.newsPipeline.configured, false);
  eq('CASE8_NEWS_NO_INSTANCE_READY', without.newsPipeline.ready, false);
  eq('CASE8_NEWS_NO_INSTANCE_REASON', without.newsPipeline.reason, 'FEATURE_DISABLED');
  var withNews = FV.getFeatureFlags({ config: makeConfig(), newsPipeline: FAKE_NEWS });
  eq('CASE8_NEWS_WITH_INSTANCE_CONFIGURED', withNews.newsPipeline.configured, true);
  eq('CASE8_NEWS_WITH_INSTANCE_CONNECTED', withNews.newsPipeline.connected, true);
  eq('CASE8_NEWS_WITH_INSTANCE_READY', withNews.newsPipeline.ready, true);
  eq('CASE8_NEWS_WITH_INSTANCE_REASON', withNews.newsPipeline.reason, null);
})();

// ─── Case 9: each feature's dependency-missing reason code is specific & accurate ───
//      deletePipeline now requires assetDeleteService (no longer hard-coded connected=true).
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({
      mqttEnabled: true, customLibraryEnabled: true, learningLibraryEnabled: true,
      advancedRenderEnabled: true, renderShadowEnabled: true, deletePipelineEnabled: true,
    }),
    // NO dependency instances provided (including no assetDeleteService)
  });
  eq('CASE9_MQTT_REASON', flags.mqtt.reason, 'MQTT_CLIENT_NOT_CREATED');
  eq('CASE9_CUSTOM_REASON', flags.customLibrary.reason, 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED');
  eq('CASE9_LEARNING_REASON', flags.learning.reason, 'LEARNING_SERVICE_NOT_CREATED');
  eq('CASE9_ADVANCED_RENDER_REASON', flags.advancedRender.reason, 'RENDER_SHADOW_NOT_CREATED');
  eq('CASE9_RENDER_SHADOW_REASON', flags.renderShadow.reason, 'RENDER_SHADOW_NOT_CREATED');
  // newsPipeline has no env flag — its "configured" IS the instance. With no instance,
  // configured=false → reason=FEATURE_DISABLED.
  eq('CASE9_NEWS_REASON', flags.newsPipeline.reason, 'FEATURE_DISABLED');
  // deletePipeline now reflects the missing delete service
  eq('CASE9_DELETE_PIPELINE_CONFIGURED', flags.deletePipeline.configured, true);
  eq('CASE9_DELETE_PIPELINE_CONNECTED', flags.deletePipeline.connected, false);
  eq('CASE9_DELETE_PIPELINE_READY', flags.deletePipeline.ready, false);
  eq('CASE9_DELETE_PIPELINE_REASON', flags.deletePipeline.reason, 'DELETE_SERVICE_NOT_CREATED');
})();

// ─── Case 10: deletePipeline.connected = !!assetDeleteService (presence-driven) ───
(function() {
  // 10a: flag on, no service → connected=false, ready=false
  var f10a = FV.getFeatureFlags({
    config: makeConfig({ deletePipelineEnabled: true }),
  });
  eq('CASE10A_DELETE_CONNECTED', f10a.deletePipeline.connected, false);
  eq('CASE10A_DELETE_READY', f10a.deletePipeline.ready, false);
  eq('CASE10A_DELETE_REASON', f10a.deletePipeline.reason, 'DELETE_SERVICE_NOT_CREATED');

  // 10b: flag on, service present → connected=true, ready=true
  var f10b = FV.getFeatureFlags({
    config: makeConfig({ deletePipelineEnabled: true }),
    assetDeleteService: FAKE_DELETE,
  });
  eq('CASE10B_DELETE_CONNECTED', f10b.deletePipeline.connected, true);
  eq('CASE10B_DELETE_READY', f10b.deletePipeline.ready, true);
  eq('CASE10B_DELETE_REASON', f10b.deletePipeline.reason, null);

  // 10c: flag off, service present → connected=true but ready=false (configured=false)
  var f10c = FV.getFeatureFlags({
    config: makeConfig({ deletePipelineEnabled: false }),
    assetDeleteService: FAKE_DELETE,
  });
  eq('CASE10C_DELETE_CONNECTED', f10c.deletePipeline.connected, true);
  eq('CASE10C_DELETE_READY', f10c.deletePipeline.ready, false);
  eq('CASE10C_DELETE_REASON', f10c.deletePipeline.reason, 'FEATURE_DISABLED');
})();

// ─── Case 11: classifier dimension — three states (port missing / port unconfigured /
//              port configured) each produce the right truth and reason. ───
(function() {
  // 11a: no port at all
  var f11a = FV.getFeatureFlags({ config: makeConfig() });
  eq('CASE11A_CLASSIFIER_CONFIGURED', f11a.classifier.configured, false);
  eq('CASE11A_CLASSIFIER_ENABLED', f11a.classifier.enabled, false);
  eq('CASE11A_CLASSIFIER_CONNECTED', f11a.classifier.connected, false);
  eq('CASE11A_CLASSIFIER_READY', f11a.classifier.ready, false);
  eq('CASE11A_CLASSIFIER_REASON', f11a.classifier.reason, 'CLASSIFIER_PORT_NOT_CREATED');

  // 11b: port exists but not configured (no model)
  var f11b = FV.getFeatureFlags({
    config: makeConfig(),
    safetyClassifierPort: CLASSIFIER_NO_MODEL,
  });
  eq('CASE11B_CLASSIFIER_CONFIGURED', f11b.classifier.configured, false);
  eq('CASE11B_CLASSIFIER_CONNECTED', f11b.classifier.connected, false);
  eq('CASE11B_CLASSIFIER_READY', f11b.classifier.ready, false);
  eq('CASE11B_CLASSIFIER_REASON', f11b.classifier.reason, 'NO_MODEL_CONFIGURED');

  // 11c: port exists and configured (model loaded)
  var f11c = FV.getFeatureFlags({
    config: makeConfig(),
    safetyClassifierPort: CLASSIFIER_READY,
  });
  eq('CASE11C_CLASSIFIER_CONFIGURED', f11c.classifier.configured, true);
  eq('CASE11C_CLASSIFIER_ENABLED', f11c.classifier.enabled, true);
  eq('CASE11C_CLASSIFIER_CONNECTED', f11c.classifier.connected, true);
  eq('CASE11C_CLASSIFIER_READY', f11c.classifier.ready, true);
  eq('CASE11C_CLASSIFIER_REASON', f11c.classifier.reason, null);

  // 11d: classifier ready propagates to customLibrary + learning readiness
  //      (already covered in Case 3, but assert the inverse here: classifier not ready
  //      blocks both even when their own services exist.)
  var f11d = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true, learningLibraryEnabled: true }),
    customLibraryService: FAKE_CUSTOM,
    learningIngestionService: FAKE_LEARNING,
    safetyClassifierPort: CLASSIFIER_NO_MODEL,
  });
  eq('CASE11D_CUSTOM_READY', f11d.customLibrary.ready, false);
  eq('CASE11D_CUSTOM_REASON', f11d.customLibrary.reason, 'SAFETY_CLASSIFIER_NOT_READY');
  eq('CASE11D_LEARNING_READY', f11d.learning.ready, false);
  eq('CASE11D_LEARNING_REASON', f11d.learning.reason, 'SAFETY_CLASSIFIER_NOT_READY');
})();

// ─── Case 11e: stub classifier — configured=true (model file exists) but ready=false ───
//      (no inference). This is the CURRENT real state when NSFW_MODEL_PATH points to an
//      existing file. The classifier feature reports configured=true, ready=false,
//      reason=SAFETY_CLASSIFIER_NOT_READY, and customLibrary/learning stay fail-closed.
(function() {
  var f11e = FV.getFeatureFlags({
    config: makeConfig(),
    safetyClassifierPort: CLASSIFIER_STUB,
  });
  eq('CASE11E_CLASSIFIER_CONFIGURED_TRUE', f11e.classifier.configured, true, 'model file exists → configured');
  eq('CASE11E_CLASSIFIER_ENABLED_TRUE', f11e.classifier.enabled, true, '');
  eq('CASE11E_CLASSIFIER_CONNECTED_FALSE', f11e.classifier.connected, false, 'no inference → not connected');
  eq('CASE11E_CLASSIFIER_READY_FALSE', f11e.classifier.ready, false, 'no inference → not ready');
  eq('CASE11E_CLASSIFIER_REASON', f11e.classifier.reason, 'SAFETY_CLASSIFIER_NOT_READY', '');

  // 11e-b: stub classifier blocks customLibrary + learning even with services present
  var f11e2 = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true, learningLibraryEnabled: true }),
    customLibraryService: FAKE_CUSTOM,
    learningIngestionService: FAKE_LEARNING,
    safetyClassifierPort: CLASSIFIER_STUB,
  });
  eq('CASE11E2_CUSTOM_READY_FALSE', f11e2.customLibrary.ready, false, 'stub classifier blocks customLibrary');
  eq('CASE11E2_CUSTOM_REASON', f11e2.customLibrary.reason, 'SAFETY_CLASSIFIER_NOT_READY', '');
  eq('CASE11E2_LEARNING_READY_FALSE', f11e2.learning.ready, false, 'stub classifier blocks learning');
  eq('CASE11E2_LEARNING_REASON', f11e2.learning.reason, 'SAFETY_CLASSIFIER_NOT_READY', '');
})();

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
