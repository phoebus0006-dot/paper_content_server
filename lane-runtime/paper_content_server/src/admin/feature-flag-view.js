// feature-flag-view.js — Feature flag view (configured vs enabled vs connected)
// options: { mqttClient, newsPipeline, customLibraryService, renderShadow, activeFrameIdProvider }
function getFeatureFlags(options) {
  options = options || {};
  var mqttClient = options.mqttClient || null;
  var newsPipeline = options.newsPipeline || null;
  var customLibraryService = options.customLibraryService || null;
  var renderShadow = options.renderShadow || null;
  var activeFrameIdProvider = options.activeFrameIdProvider || function() { return null; };

  var mqttConfigured = !!mqttClient;
  var mqttConnected = mqttConfigured && typeof mqttClient.isConnected === 'function' ? !!mqttClient.isConnected() : mqttConfigured;
  var newsConfigured = !!newsPipeline;

  return Object.freeze({
    newsPipeline: { configured: newsConfigured, enabled: newsConfigured, connected: newsConfigured, ready: newsConfigured },
    mqtt: { configured: mqttConfigured, enabled: mqttConfigured, connected: mqttConnected, ready: mqttConnected },
    learning: { configured: false, enabled: false, connected: false, ready: false },
    customLibrary: { configured: !!customLibraryService, enabled: !!customLibraryService, connected: !!customLibraryService, ready: !!customLibraryService },
    advancedRender: { configured: !!renderShadow, enabled: !!renderShadow, connected: !!renderShadow, ready: !!renderShadow },
    deletePipeline: { configured: false, enabled: false, connected: false, ready: false },
    adminReadOnly: { configured: true, enabled: true, connected: true, ready: true },
    activeFrameId: safeActiveFrameId(activeFrameIdProvider),
  });
}

function safeActiveFrameId(provider) {
  try { return provider() || null; }
  catch (e) { return null; }
}

module.exports = { getFeatureFlags: getFeatureFlags };
