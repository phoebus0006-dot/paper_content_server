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
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
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

// Feature keys that carry the 5-dimension shape (adminReadOnly is constant-true,
// activeFrameId is a passthrough scalar — neither is a configurable feature flag).
var FEATURE_KEYS = ['mqtt','newsPipeline','customLibrary','learning','advancedRender','renderShadow','deletePipeline'];

console.log('=== Feature Flag Truth Model Test ===');

// ─── Case 1: all flags false → every feature ready=false, reason=FEATURE_DISABLED ───
(function() {
  var flags = FV.getFeatureFlags({ config: makeConfig() });
  FEATURE_KEYS.forEach(function(k) {
    eq('CASE1_' + k + '_CONFIGURED', flags[k].configured, false);
    eq('CASE1_' + k + '_ENABLED', flags[k].enabled, false);
    eq('CASE1_' + k + '_READY', flags[k].ready, false);
    eq('CASE1_' + k + '_REASON', flags[k].reason, 'FEATURE_DISABLED');
  });
  // deletePipeline is code-level: always "connected" even when not configured,
  // so connected=true here — but ready is still false (gated by configured=false).
  eq('CASE1_DELETE_PIPELINE_CONNECTED', flags.deletePipeline.connected, true);
})();

// ─── Case 2: CUSTOM_LIBRARY_ENABLED=true but no service → ready=false, dependency missing ───
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true }),
    // customLibraryService intentionally NOT provided
  });
  eq('CASE2_CUSTOM_CONFIGURED', flags.customLibrary.configured, true);
  eq('CASE2_CUSTOM_ENABLED', flags.customLibrary.enabled, true);
  eq('CASE2_CUSTOM_CONNECTED', flags.customLibrary.connected, false);
  eq('CASE2_CUSTOM_READY', flags.customLibrary.ready, false);
  // reason identifies the missing dependency (the flag() fallback is DEPENDENCY_MISSING;
  // the specific code supplied to flag() takes precedence and is more informative).
  t('CASE2_CUSTOM_REASON_IS_DEP_MISSING',
    flags.customLibrary.reason === 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED' ||
    flags.customLibrary.reason === 'DEPENDENCY_MISSING',
    'got ' + flags.customLibrary.reason);
  eq('CASE2_CUSTOM_REASON_SPECIFIC', flags.customLibrary.reason, 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED');
})();

// ─── Case 3: CUSTOM_LIBRARY_ENABLED=true AND service present → ready=true ───
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({ customLibraryEnabled: true }),
    customLibraryService: FAKE_CUSTOM,
  });
  eq('CASE3_CUSTOM_CONFIGURED', flags.customLibrary.configured, true);
  eq('CASE3_CUSTOM_ENABLED', flags.customLibrary.enabled, true);
  eq('CASE3_CUSTOM_CONNECTED', flags.customLibrary.connected, true);
  eq('CASE3_CUSTOM_READY', flags.customLibrary.ready, true);
  eq('CASE3_CUSTOM_REASON', flags.customLibrary.reason, null);
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
})();

// ─── Case 6: loadConfig integration — features default to false when env unset ───
(function() {
  var c = cfg({});
  t('CASE6_FEATURES_BLOCK', typeof c.features === 'object' && c.features !== null, '');
  eq('CASE6_CUSTOM_LIBRARY_DEFAULT', c.features.customLibraryEnabled, false);
  eq('CASE6_LEARNING_DEFAULT', c.features.learningLibraryEnabled, false);
  eq('CASE6_ADVANCED_RENDER_DEFAULT', c.features.advancedRenderEnabled, false);
  eq('CASE6_RENDER_SHADOW_DEFAULT', c.features.renderShadowEnabled, false);
  eq('CASE6_DELETE_PIPELINE_DEFAULT', c.features.deletePipelineEnabled, false);
  eq('CASE6_MQTT_DEFAULT', c.features.mqttEnabled, false);
})();

// ─── Case 7: parseBoolEnv accepts true/1/yes (case-insensitive); rejects 0/no/false ───
(function() {
  var c = cfg({
    CUSTOM_LIBRARY_ENABLED: 'true',
    LEARNING_LIBRARY_ENABLED: '1',
    MQTT_ENABLED: 'yes',
    R9_ADVANCED_RENDER_ENABLED: 'TRUE',
    DELETE_PIPELINE_ENABLED: '0',
    R9_RENDER_SHADOW_ENABLED: 'no',
  });
  eq('CASE7_CUSTOM_TRUE', c.features.customLibraryEnabled, true);
  eq('CASE7_LEARNING_ONE', c.features.learningLibraryEnabled, true);
  eq('CASE7_MQTT_YES', c.features.mqttEnabled, true);
  eq('CASE7_ADVANCED_RENDER_CAPS', c.features.advancedRenderEnabled, true);
  eq('CASE7_DELETE_ZERO_FALSE', c.features.deletePipelineEnabled, false);
  eq('CASE7_SHADOW_NO_FALSE', c.features.renderShadowEnabled, false);
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
(function() {
  var flags = FV.getFeatureFlags({
    config: makeConfig({
      mqttEnabled: true, customLibraryEnabled: true, learningLibraryEnabled: true,
      advancedRenderEnabled: true, renderShadowEnabled: true, deletePipelineEnabled: true,
    }),
    // NO dependency instances provided (deletePipeline needs none — it is code-level)
  });
  eq('CASE9_MQTT_REASON', flags.mqtt.reason, 'MQTT_CLIENT_NOT_CREATED');
  eq('CASE9_CUSTOM_REASON', flags.customLibrary.reason, 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED');
  eq('CASE9_LEARNING_REASON', flags.learning.reason, 'LEARNING_SERVICE_NOT_CREATED');
  eq('CASE9_ADVANCED_RENDER_REASON', flags.advancedRender.reason, 'RENDER_SHADOW_NOT_CREATED');
  eq('CASE9_RENDER_SHADOW_REASON', flags.renderShadow.reason, 'RENDER_SHADOW_NOT_CREATED');
  // newsPipeline has no env flag — its "configured" IS the instance. With no instance,
  // configured=false → reason=FEATURE_DISABLED. (The NEWS_PIPELINE_NOT_INITIALIZED
  // code is only reachable when configured and connected can diverge, which they
  // cannot for this flag since both derive from the same instance reference.)
  eq('CASE9_NEWS_REASON', flags.newsPipeline.reason, 'FEATURE_DISABLED');
  // deletePipeline is code-level: always connected, so configured=true → ready=true
  eq('CASE9_DELETE_PIPELINE_READY', flags.deletePipeline.ready, true);
  eq('CASE9_DELETE_PIPELINE_REASON', flags.deletePipeline.reason, null);
})();

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
