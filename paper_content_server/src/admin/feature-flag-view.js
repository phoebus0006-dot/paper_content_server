// feature-flag-view.js — Feature flag view with 5-dimension truth model.
//
// Each feature reports five dimensions:
//   configured — config flag is set to true (single source of truth: load-config.js)
//   enabled    — equivalent to configured for boolean flags
//   connected  — the dependency instance the feature needs actually exists at runtime
//   ready      — configured && connected (the gate production code should check)
//   reason     — null when ready, otherwise WHY it is not ready:
//                  FEATURE_DISABLED      (configured=false)
//                  <DEPENDENCY_CODE>     (configured=true but dependency missing)
//
// Classifier-aware truth:
//   customLibrary and learning both depend on the safety classifier being ready.
//   "ready" means the classifier port can actually run inference (port.ready === true),
//   NOT merely that a model path was configured. When the classifier is missing or
//   cannot run inference, those features report ready=false with reason=
//   SAFETY_CLASSIFIER_NOT_READY even if their own service instance exists. This
//   prevents the upload/ingest routes from accepting content that cannot be
//   safety-checked.
//
//   The classifier port exposes a 5-level readiness truth:
//     configured    — modelPath was provided
//     modelExists   — the model file exists on disk
//     loaded        — runtime loaded the model (false without a real loader)
//     inferenceReady — smoke inference succeeded (false without a real engine)
//     ready         — = inferenceReady; only true when inference is actually usable
//   The customLibrary/learning gate uses `ready` (not `configured`), so a stub
//   classifier that only has a model file but no inference never reports ready.
//
// options: {
//   config,                         // APP_CONFIG (drives `configured`)
//   mqttClient, newsPipeline,
//   customLibraryService, learningIngestionService,
//   renderShadow, assetDeleteService,
//   safetyClassifierPort,           // { configured, modelExists, loaded, inferenceReady, ready } — classifier readiness
//   activeFrameIdProvider
// }
function getFeatureFlags(options) {
  options = options || {};
  var config = options.config || {};
  var features = config.features || {};
  var mqttClient = options.mqttClient || null;
  var newsPipeline = options.newsPipeline || null;
  var customLibraryService = options.customLibraryService || null;
  var learningIngestionService = options.learningIngestionService || null;
  var renderShadow = options.renderShadow || null;
  var assetDeleteService = options.assetDeleteService || null;
  var safetyClassifierPort = options.safetyClassifierPort || null;
  var activeFrameIdProvider = options.activeFrameIdProvider || function() { return null; };

  // classifier readiness uses port.ready (inference actually usable), NOT port.configured
  // (which only means a modelPath was provided). Without a real inference implementation
  // port.ready is always false, so customLibrary/learning stay fail-closed even when a
  // model file exists.
  var portConfigured = !!(safetyClassifierPort && safetyClassifierPort.configured);
  var portReady = !!(safetyClassifierPort && safetyClassifierPort.ready);
  var classifierReady = portReady;

  function flag(enabled, connected, reason) {
    enabled = !!enabled;
    connected = !!connected;
    return {
      configured: enabled,
      enabled: enabled,
      connected: connected,
      ready: enabled && connected,
      reason: (!enabled ? 'FEATURE_DISABLED' : (!connected ? (reason || 'DEPENDENCY_MISSING') : null)),
    };
  }

  // customLibrary / learning connectedness requires BOTH the feature's own service
  // AND a ready classifier (because the service cannot function without safety gating).
  var customLibraryConnected = !!customLibraryService && classifierReady;
  var learningConnected = !!learningIngestionService && classifierReady;

  return Object.freeze({
    mqtt: flag(features.mqttEnabled, mqttClient, 'MQTT_CLIENT_NOT_CREATED'),
    newsPipeline: flag(!!newsPipeline, newsPipeline, 'NEWS_PIPELINE_NOT_INITIALIZED'),
    customLibrary: {
      configured: features.customLibraryEnabled,
      enabled: features.customLibraryEnabled,
      connected: customLibraryConnected,
      ready: features.customLibraryEnabled && customLibraryConnected,
      reason: !features.customLibraryEnabled ? 'FEATURE_DISABLED'
              : (!customLibraryService ? 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED'
              : (!classifierReady ? 'SAFETY_CLASSIFIER_NOT_READY' : null)),
    },
    learning: {
      configured: features.learningLibraryEnabled,
      enabled: features.learningLibraryEnabled,
      connected: learningConnected,
      ready: features.learningLibraryEnabled && learningConnected,
      reason: !features.learningLibraryEnabled ? 'FEATURE_DISABLED'
              : (!learningIngestionService ? 'LEARNING_SERVICE_NOT_CREATED'
              : (!classifierReady ? 'SAFETY_CLASSIFIER_NOT_READY' : null)),
    },
    advancedRender: flag(features.advancedRenderEnabled, renderShadow, 'RENDER_SHADOW_NOT_CREATED'),
    renderShadow: flag(features.renderShadowEnabled, renderShadow, 'RENDER_SHADOW_NOT_CREATED'),
    // deletePipeline connectedness is the real assetDeleteService instance — when the
    // service fails to construct (config flag on but dependency init threw), the truth
    // model surfaces ready=false with DELETE_SERVICE_NOT_CREATED.
    deletePipeline: flag(features.deletePipelineEnabled, assetDeleteService, 'DELETE_SERVICE_NOT_CREATED'),
    classifier: {
      // 5-level truth mirrored from the port: configured = modelPath provided,
      // connected/ready = port.ready (inference usable). A stub classifier that
      // only has a model file but no inference reports configured=true, ready=false,
      // reason=SAFETY_CLASSIFIER_NOT_READY.
      configured: portConfigured,
      enabled: portConfigured,
      connected: portReady,
      ready: portReady,
      reason: !safetyClassifierPort ? 'CLASSIFIER_PORT_NOT_CREATED'
              : (!portConfigured ? 'NO_MODEL_CONFIGURED'
              : (!portReady ? 'SAFETY_CLASSIFIER_NOT_READY' : null)),
    },
    adminReadOnly: { configured: true, enabled: true, connected: true, ready: true, reason: null },
    activeFrameId: safeActiveFrameId(activeFrameIdProvider),
  });
}

function safeActiveFrameId(provider) {
  try { return provider() || null; }
  catch (e) { return null; }
}

module.exports = { getFeatureFlags: getFeatureFlags };
