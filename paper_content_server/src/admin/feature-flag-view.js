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
//   When the classifier port is missing or has no model configured, those features
//   report ready=false with reason=SAFETY_CLASSIFIER_NOT_READY even if their own
//   service instance exists. This prevents the upload/ingest routes from accepting
//   content that cannot be safety-checked.
//
// options: {
//   config,                         // APP_CONFIG (drives `configured`)
//   mqttClient, newsPipeline,
//   customLibraryService, learningIngestionService,
//   renderShadow, assetDeleteService,
//   safetyClassifierPort,           // { configured: boolean } — classifier readiness
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

  // classifier ready = port exists AND port.configured === true (i.e. a model is loaded).
  var classifierReady = !!(safetyClassifierPort && safetyClassifierPort.configured);

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
      configured: classifierReady,
      enabled: classifierReady,
      connected: classifierReady,
      ready: classifierReady,
      reason: !safetyClassifierPort ? 'CLASSIFIER_PORT_NOT_CREATED'
              : (!safetyClassifierPort.configured ? 'NO_MODEL_CONFIGURED' : null),
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
