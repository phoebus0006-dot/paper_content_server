// feature-flag-view.js — Feature flag view (configured vs enabled vs connected)
function getFeatureFlags() {
  return Object.freeze({
    newsPipeline: { configured: true, enabled: true },
    mqtt: { configured: false, enabled: false, connected: false },
    learning: { configured: false, enabled: false },
    customLibrary: { configured: false, enabled: false },
    advancedRender: { configured: false, enabled: false },
    deletePipeline: { configured: false, enabled: false },
    adminReadOnly: { configured: true, enabled: true },
  });
}
module.exports = { getFeatureFlags: getFeatureFlags };
