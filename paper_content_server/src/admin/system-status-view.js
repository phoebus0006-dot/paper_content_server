// system-status-view.js — System status response builder
function buildSystemStatusResponse(status) {
  return {
    activeSnapshotId: status.activeSnapshotId || null,
    activeFrameId: status.activeFrameId || null,
    lastPublicationAt: status.lastPublicationAt || null,
    snapshotCount: status.snapshotCount || 0,
    snapshotIntegrity: true,
    services: {
      newsPipeline: { configured: true, enabled: true },
      mqtt: { configured: status.mqttEnabled || false, enabled: false, connected: false },
      learning: { configured: status.learningEnabled || false, enabled: false },
      customLibrary: { configured: status.customLibraryEnabled || false, enabled: false },
      advancedRender: { configured: status.advancedRenderEnabled || false, enabled: false },
      deletePipeline: { configured: status.deletePipelineEnabled || false, enabled: false },
    },
    timestamp: status.timestamp || new Date().toISOString(),
  };
}
module.exports = { buildSystemStatusResponse: buildSystemStatusResponse };
