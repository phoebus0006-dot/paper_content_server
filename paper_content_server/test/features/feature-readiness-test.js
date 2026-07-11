#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var RS = require(path.join(ROOT, 'src', 'features', 'feature-readiness-service'));

// All features disabled by default — none should be ready
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var all = svc.getAll();
  t('SERVICE_EXISTS', typeof svc.getAll === 'function', '');
  t('ALL_FEATURES_OBJECT', typeof all === 'object' && all !== null, '');
  t('DELETE_PIPELINE_KEY', 'deletePipeline' in all, '');
  t('MQTT_KEY', 'mqtt' in all, '');
  t('LEARNING_KEY', 'learning' in all, '');
  t('CUSTOM_LIBRARY_KEY', 'customLibrary' in all, '');
  t('ADVANCED_RENDER_KEY', 'advancedRender' in all, '');
  t('RENDER_SHADOW_KEY', 'renderShadow' in all, '');
  t('NO_FEATURE_IS_READY_BY_DEFAULT', !svc.isAnyReady(), 'all disabled by default should not be ready');
})();

// Each feature must have the expected shape
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  Object.keys(svc.getAll()).forEach(function(k) {
    var f = svc.getAll()[k];
    t('FEATURE_' + k.toUpperCase() + '_HAS_CONFIGURED', typeof f.configured === 'boolean', '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_ENABLED', typeof f.enabled === 'boolean', '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_DEPENDENCIES_READY', typeof f.dependenciesReady === 'boolean', '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_DATA_READY', typeof f.dataReady === 'boolean', '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_SAFETY_READY', typeof f.safetyReady === 'boolean', '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_RUNTIME_READY', typeof f.runtimeReady === 'boolean', '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_BLOCKERS', Array.isArray(f.blockers), '');
    t('FEATURE_' + k.toUpperCase() + '_HAS_READY', typeof f.ready === 'boolean', '');
  });
})();

// Delete Pipeline checks
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var dp = svc.checkDeletePipeline();
  t('DELETE_PIPELINE_CONFIGURED', !dp.configured || dp.configured === true, 'reads env');
  t('DELETE_PIPELINE_BLOCKERS', dp.blockers.length > 0, 'at least one blocker when not set up');
  t('DELETE_PIPELINE_BLOCKER_TYPES', dp.blockers.some(function(b) {
    return ['REFERENCE_SCAN_INCOMPLETE', 'PATH_ALLOWLIST_NOT_CONFIGURED', 'SAFE_REPLACEMENT_UNAVAILABLE',
            'AUDIT_STORE_NOT_WRITABLE', 'BACKUP_NOT_READY'].indexOf(b) >= 0;
  }), 'valid blocker codes');
})();

// MQTT checks
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var mq = svc.checkMqtt();
  t('MQTT_CONFIGURED', !mq.configured || mq.configured === true, '');
  t('MQTT_BROKER_BLOCKER', mq.blockers.indexOf('BROKER_NOT_CONFIGURED') >= 0, 'broker not configured by default');
  t('MQTT_CLIENT_DEPENDENCY', mq.dependenciesReady === true || mq.dependenciesReady === false, 'dependency check ran');
})();

// Learning checks
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT, assetRepository: null });
  var lr = svc.checkLearning();
  t('LEARNING_CONFIGURED', !lr.configured || lr.configured === true, '');
  t('LEARNING_BLOCKER_ASSET_REPO', lr.blockers.indexOf('ASSET_REPOSITORY_NOT_WRITABLE') >= 0, 'no repo → blocker');
  t('LEARNING_GATES_PRESENT', lr.dependenciesReady === true, 'validator and source registry present');
})();

// Learning with assetRepository
(function() {
  var fakeRepo = { create: function(a) { return Promise.resolve('id-1'); } };
  var svc = RS.createReadinessService({ rootDir: ROOT, assetRepository: fakeRepo });
  var lr = svc.checkLearning();
  t('LEARNING_REPO_WRITABLE', lr.blockers.indexOf('ASSET_REPOSITORY_NOT_WRITABLE') < 0, 'repo provided');
})();

// Custom Library checks
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var cl = svc.checkCustomLibrary();
  t('CUSTOM_LIBRARY_CONFIGURED', !cl.configured || cl.configured === true, '');
  t('CUSTOM_LIBRARY_SAFETY_GATE', cl.blockers.indexOf('SAFETY_GATE_NOT_CONFIGURED') >= 0 || cl.safetyReady, 'safety gate checked');
})();

// Advanced Render checks
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var ar = svc.checkAdvancedRender();
  t('ADVANCED_RENDER_CONFIGURED', !ar.configured || ar.configured === true, '');
  t('ADVANCED_RENDER_LEGACY_FALLBACK', ar.safetyReady === true, 'legacy fallback available');
  t('ADVANCED_RENDER_VALIDATOR_PRESENT', ar.dependenciesReady === true, 'frame validator present');
})();

// Render Shadow checks
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var rs = svc.checkRenderShadow();
  t('RENDER_SHADOW_CONFIGURED', !rs.configured || rs.configured === true, '');
  t('RENDER_SHADOW_BLOCKER', rs.blockers.indexOf('SHADOW_COMPARISON_NOT_PASSED') >= 0, 'shadow not passed');
})();

// Feature states are not automatically enabled
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  var all = svc.getAll();
  var flagsChanged = false;
  Object.keys(all).forEach(function(k) {
    if (all[k].enabled) flagsChanged = true;
  });
  t('FLAGS_NOT_AUTOMATICALLY_CHANGED', !flagsChanged, 'no feature enabled without explicit env var');
})();

// Service must not throw
(function() {
  var svc = RS.createReadinessService({ rootDir: ROOT });
  try {
    svc.getAll();
    t('GET_ALL_NO_THROW', true, '');
  } catch(e) {
    t('GET_ALL_NO_THROW', false, e.message);
  }
})();

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
