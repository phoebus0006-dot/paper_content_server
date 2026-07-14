// system-status-view.js — System status response builder
function buildSystemStatusResponse(status) {
  return {
    activeSnapshotId: status.activeSnapshotId || null,
    activeFrameId: status.activeFrameId || null,
    lastPublicationAt: status.lastPublicationAt || null,
    snapshotCount: status.snapshotCount || 0,
    snapshotIntegrity: true,
    services: {
      newsPipeline: { configured: true, enabled: true, connected: true, ready: true },
      mqtt: { configured: false, enabled: false, connected: false, ready: false },
      learning: { configured: false, enabled: false, connected: false, ready: false },
      customLibrary: { configured: false, enabled: false, connected: false, ready: false },
      advancedRender: { configured: false, enabled: false, connected: false, ready: false },
      deletePipeline: { configured: false, enabled: false, connected: false, ready: false },
    },
    timestamp: status.timestamp || new Date().toISOString(),
  };
}
module.exports = { buildSystemStatusResponse: buildSystemStatusResponse };
