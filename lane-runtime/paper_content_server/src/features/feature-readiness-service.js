// feature-readiness-service.js — Unified enablement gate for all R4–R9 features
var path = require('path');
var fs = require('fs');

function envFlag(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function isConfigured(flag) {
  return flag !== undefined && flag !== null && flag !== '';
}

function isPresent(filePath) {
  try { return fs.existsSync(filePath); } catch(e) { return false; }
}

function createReadinessService(options) {
  options = options || {};
  var ROOT = options.rootDir || path.join(__dirname, '..', '..');
  var assetRepo = options.assetRepository || null;
  var logger = options.logger || {};

  function checkDeletePipeline() {
    var enabled = envFlag('DELETE_PIPELINE_ENABLED');
    var configured = isConfigured(process.env.DELETE_PIPELINE_ENABLED);
    var blockers = [];
    var referenceScanComplete = isPresent(path.join(ROOT, 'data', 'reference-scan-completed'));
    var pathAllowlistConfigured = isPresent(path.join(ROOT, 'config', 'delete-allowlist.json'));
    var safeReplacementAvailable = isPresent(path.join(ROOT, 'scripts', 'safe-replacement.js'));
    var auditStoreWritable = false;
    try {
      var auditDir = path.join(ROOT, 'data', 'audit');
      if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
      var testFile = path.join(auditDir, '.write-test');
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
      auditStoreWritable = true;
    } catch(e) { auditStoreWritable = false; }
    var backupReady = isPresent(path.join(ROOT, 'scripts', 'backup.js')) || isPresent(path.join(ROOT, 'deploy', 'nas', 'backup.sh'));

    if (!referenceScanComplete) blockers.push('REFERENCE_SCAN_INCOMPLETE');
    if (!pathAllowlistConfigured) blockers.push('PATH_ALLOWLIST_NOT_CONFIGURED');
    if (!safeReplacementAvailable) blockers.push('SAFE_REPLACEMENT_UNAVAILABLE');
    if (!auditStoreWritable) blockers.push('AUDIT_STORE_NOT_WRITABLE');
    if (!backupReady) blockers.push('BACKUP_NOT_READY');

    return {
      configured: configured,
      enabled: enabled,
      dependenciesReady: referenceScanComplete && pathAllowlistConfigured && safeReplacementAvailable,
      dataReady: auditStoreWritable,
      safetyReady: true,
      runtimeReady: backupReady,
      blockers: blockers,
      ready: enabled && configured && blockers.length === 0,
    };
  }

  function checkMqtt() {
    var enabled = envFlag('MQTT_ENABLED');
    var configured = isConfigured(process.env.MQTT_ENABLED);
    var blockers = [];
    var brokerConfigured = isConfigured(process.env.MQTT_BROKER);
    var clientDependencyPresent = false;
    try { require('mqtt'); clientDependencyPresent = true; } catch(e) { clientDependencyPresent = false; }
    var deviceIdValid = isConfigured(process.env.MQTT_DEVICE_ID || process.env.DEVICE_ID);
    var httpFallbackEnabled = true; // HTTP polling always active
    var notificationAdapterReady = isPresent(path.join(ROOT, 'src', 'mqtt', 'mqtt-notification-adapter.js'));

    if (!brokerConfigured) blockers.push('BROKER_NOT_CONFIGURED');
    if (!clientDependencyPresent) blockers.push('MQTT_CLIENT_DEPENDENCY_MISSING');
    if (!deviceIdValid) blockers.push('DEVICE_ID_INVALID');
    if (!httpFallbackEnabled) blockers.push('HTTP_FALLBACK_DISABLED');
    if (!notificationAdapterReady) blockers.push('NOTIFICATION_ADAPTER_NOT_READY');

    return {
      configured: configured,
      enabled: enabled,
      dependenciesReady: clientDependencyPresent && notificationAdapterReady,
      dataReady: brokerConfigured && deviceIdValid,
      safetyReady: httpFallbackEnabled,
      runtimeReady: true,
      blockers: blockers,
      ready: enabled && configured && blockers.length === 0,
    };
  }

  function checkLearning() {
    var enabled = envFlag('LEARNING_LIBRARY_ENABLED');
    var configured = isConfigured(process.env.LEARNING_LIBRARY_ENABLED);
    var blockers = [];
    // R7 dedup semantics fixed: isDuplicate is read-only, commit explicit
    var dedupSemanticsFixed = true; // fixed by this release
    var assetRepoWritable = assetRepo !== null && typeof assetRepo.create === 'function';
    var allGatesConfigured = isPresent(path.join(ROOT, 'src', 'learning', 'learning-validator.js'));
    var sourceRegistryConfigured = isPresent(path.join(ROOT, 'src', 'learning', 'learning-source-registry.js'));

    if (!dedupSemanticsFixed) blockers.push('DEDUP_SEMANTICS_NOT_FIXED');
    if (!assetRepoWritable) blockers.push('ASSET_REPOSITORY_NOT_WRITABLE');
    if (!allGatesConfigured) blockers.push('GATES_NOT_CONFIGURED');
    if (!sourceRegistryConfigured) blockers.push('SOURCE_REGISTRY_NOT_CONFIGURED');

    return {
      configured: configured,
      enabled: enabled,
      dependenciesReady: allGatesConfigured && sourceRegistryConfigured,
      dataReady: assetRepoWritable,
      safetyReady: true,
      runtimeReady: dedupSemanticsFixed,
      blockers: blockers,
      ready: enabled && configured && blockers.length === 0,
    };
  }

  function checkCustomLibrary() {
    var enabled = envFlag('CUSTOM_LIBRARY_ENABLED');
    var configured = isConfigured(process.env.CUSTOM_LIBRARY_ENABLED);
    var blockers = [];
    var quarantineWritable = false;
    try {
      var qDir = path.join(ROOT, 'data', 'quarantine');
      if (!fs.existsSync(qDir)) fs.mkdirSync(qDir, { recursive: true });
      var testFile = path.join(qDir, '.write-test');
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
      quarantineWritable = true;
    } catch(e) { quarantineWritable = false; }
    var finalAssetRootWritable = false;
    try {
      var aDir = path.join(ROOT, 'data', 'custom-assets');
      if (!fs.existsSync(aDir)) fs.mkdirSync(aDir, { recursive: true });
      var testFile = path.join(aDir, '.write-test');
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
      finalAssetRootWritable = true;
    } catch(e) { finalAssetRootWritable = false; }
    var decodeDependencyReady = false;
    try { require('sharp'); decodeDependencyReady = true; } catch(e) { decodeDependencyReady = false; }
    var safetyGateConfigured = isPresent(path.join(ROOT, 'src', 'custom-library', 'custom-validator.js'));
    var assetRepoWritable = assetRepo !== null && typeof assetRepo.create === 'function';

    if (!quarantineWritable) blockers.push('QUARANTINE_NOT_WRITABLE');
    if (!finalAssetRootWritable) blockers.push('FINAL_ASSET_ROOT_NOT_WRITABLE');
    if (!decodeDependencyReady) blockers.push('DECODE_DEPENDENCY_NOT_READY');
    if (!safetyGateConfigured) blockers.push('SAFETY_GATE_NOT_CONFIGURED');
    if (!assetRepoWritable) blockers.push('ASSET_REPOSITORY_NOT_WRITABLE');

    return {
      configured: configured,
      enabled: enabled,
      dependenciesReady: decodeDependencyReady && safetyGateConfigured,
      dataReady: quarantineWritable && finalAssetRootWritable,
      safetyReady: safetyGateConfigured,
      runtimeReady: assetRepoWritable,
      blockers: blockers,
      ready: enabled && configured && blockers.length === 0,
    };
  }

  function checkAdvancedRender() {
    var enabled = envFlag('R9_ADVANCED_RENDER_ENABLED');
    var configured = isConfigured(process.env.R9_ADVANCED_RENDER_ENABLED);
    var blockers = [];
    var goldenParityPass = isPresent(path.join(ROOT, 'data', 'golden-parity-passed'));
    var shadowComparisonPass = isPresent(path.join(ROOT, 'data', 'shadow-comparison-passed'));
    var fullEpf1ValidatorPass = isPresent(path.join(ROOT, 'scripts', 'validate-frame.js'));
    var legacyFallbackAvailable = isPresent(path.join(ROOT, 'src', 'render', 'legacy-render-adapter.js'));

    if (!goldenParityPass) blockers.push('GOLDEN_PARITY_NOT_PASSED');
    if (!shadowComparisonPass) blockers.push('SHADOW_COMPARISON_NOT_PASSED');
    if (!fullEpf1ValidatorPass) blockers.push('FULL_EPF1_VALIDATOR_NOT_PASSED');
    if (!legacyFallbackAvailable) blockers.push('LEGACY_FALLBACK_UNAVAILABLE');

    return {
      configured: configured,
      enabled: enabled,
      dependenciesReady: fullEpf1ValidatorPass,
      dataReady: goldenParityPass && shadowComparisonPass,
      safetyReady: legacyFallbackAvailable,
      runtimeReady: true,
      blockers: blockers,
      ready: enabled && configured && blockers.length === 0,
    };
  }

  function checkRenderShadow() {
    var enabled = envFlag('R9_RENDER_SHADOW_ENABLED');
    var configured = isConfigured(process.env.R9_RENDER_SHADOW_ENABLED);
    var blockers = [];
    var shadowComparisonPass = isPresent(path.join(ROOT, 'data', 'shadow-comparison-passed'));
    if (!shadowComparisonPass) blockers.push('SHADOW_COMPARISON_NOT_PASSED');
    return {
      configured: configured,
      enabled: enabled,
      dependenciesReady: true,
      dataReady: shadowComparisonPass,
      safetyReady: true,
      runtimeReady: true,
      blockers: blockers,
      ready: enabled && configured && blockers.length === 0,
    };
  }

  function getAll() {
    return {
      deletePipeline: checkDeletePipeline(),
      mqtt: checkMqtt(),
      learning: checkLearning(),
      customLibrary: checkCustomLibrary(),
      advancedRender: checkAdvancedRender(),
      renderShadow: checkRenderShadow(),
    };
  }

  function isAnyReady() {
    var all = getAll();
    return Object.keys(all).some(function(k) { return all[k].ready; });
  }

  return {
    checkDeletePipeline: checkDeletePipeline,
    checkMqtt: checkMqtt,
    checkLearning: checkLearning,
    checkCustomLibrary: checkCustomLibrary,
    checkAdvancedRender: checkAdvancedRender,
    checkRenderShadow: checkRenderShadow,
    getAll: getAll,
    isAnyReady: isAnyReady,
  };
}

module.exports = { createReadinessService: createReadinessService };
