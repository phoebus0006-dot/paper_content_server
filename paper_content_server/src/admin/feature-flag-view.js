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
// options: {
//   config,                         // APP_CONFIG (drives `configured`)
//   mqttClient, newsPipeline,
//   customLibraryService, learningIngestionService,
//   renderShadow, activeFrameIdProvider
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
  var activeFrameIdProvider = options.activeFrameIdProvider || function() { return null; };

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

  return Object.freeze({
    mqtt: flag(features.mqttEnabled, mqttClient, 'MQTT_CLIENT_NOT_CREATED'),
    newsPipeline: flag(!!newsPipeline, newsPipeline, 'NEWS_PIPELINE_NOT_INITIALIZED'),
    customLibrary: flag(features.customLibraryEnabled, customLibraryService, 'CUSTOM_LIBRARY_SERVICE_NOT_CREATED'),
    learning: flag(features.learningLibraryEnabled, learningIngestionService, 'LEARNING_SERVICE_NOT_CREATED'),
    advancedRender: flag(features.advancedRenderEnabled, renderShadow, 'RENDER_SHADOW_NOT_CREATED'),
    renderShadow: flag(features.renderShadowEnabled, renderShadow, 'RENDER_SHADOW_NOT_CREATED'),
    // deletePipeline is code-level — no external dependency to "connect", so it is
    // always connected; readiness is purely a function of the config flag.
    deletePipeline: flag(features.deletePipelineEnabled, true, null),
    adminReadOnly: { configured: true, enabled: true, connected: true, ready: true, reason: null },
    activeFrameId: safeActiveFrameId(activeFrameIdProvider),
  });
}

function safeActiveFrameId(provider) {
  try { return provider() || null; }
  catch (e) { return null; }
}

module.exports = { getFeatureFlags: getFeatureFlags };
