// feature-flag-view.js — Feature flag view (configured vs enabled vs connected)
function getFeatureFlags() {
  return Object.freeze({
    newsPipeline: { configured: true, enabled: true, connected: true, ready: true },
    mqtt: { configured: false, enabled: false, connected: false, ready: false },
    learning: { configured: false, enabled: false, connected: false, ready: false },
    customLibrary: { configured: false, enabled: false, connected: false, ready: false },
    advancedRender: { configured: false, enabled: false, connected: false, ready: false },
    deletePipeline: { configured: false, enabled: false, connected: false, ready: false },
    adminReadOnly: { configured: true, enabled: true, connected: true, ready: true },
    activeFrameId: null,
  });
}
module.exports = { getFeatureFlags: getFeatureFlags };
