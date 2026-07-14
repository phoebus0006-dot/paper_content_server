// admin-query-service.js — Read-only admin query service
function createAdminQueryService(snapshotStore, publicationHistory, assetRepository, featureFlags, logger) {
  logger = logger || {};

  function getSystemStatus() {
    var status = { timestamp: new Date().toISOString() };
    return snapshotStore.readActive().then(function(active) {
      if (active) { status.activeSnapshotId = active.activeSnapshotId; }
      return snapshotStore.load(active ? active.activeSnapshotId : null);
    }).then(function(snap) {
      if (snap) { status.activeFrameId = snap.frameId; }
      return snapshotStore.listSnapshots();
    }).then(function(snapshots) {
      status.snapshotCount = snapshots.length;
      if (publicationHistory) return publicationHistory.latest();
    }).then(function(latest) {
      if (latest) status.lastPublicationAt = latest.publishedAt;
      // Feature flags (safe, no secrets)
      if (featureFlags) { Object.keys(featureFlags).forEach(function(k) { status[k] = featureFlags[k]; }); }
      return status;
    }).catch(function(e) {
      status.error = e.message; return status;
    });
  }

  function listPublications() {
    if (!publicationHistory) return Promise.resolve([]);
    return publicationHistory.list();
  }

  function getPublication(snapshotId) {
    if (!snapshotStore) return Promise.resolve(null);
    return snapshotStore.load(snapshotId).then(function(snap) {
      if (!snap) return null;
      return { snapshotId: snap.snapshotId, frameId: snap.frameId, contentType: snap.mode, createdAt: snap.createdAt, frameSha256: snap.frameSha256, frameLength: snap.frameLength };
    }).catch(function(e) { return { snapshotId: snapshotId, error: e.message, integrityError: true }; });
  }

  function listAssets(filter) {
    if (!assetRepository) return Promise.resolve([]);
    var f = {};
    if (filter.libraryType) f.libraryType = filter.libraryType;
    if (filter.safetyStatus) f.safetyStatus = filter.safetyStatus;
    if (filter.lifecycleStatus) f.lifecycleStatus = filter.lifecycleStatus;
    if (filter.sha256) f.sha256 = filter.sha256;
    return assetRepository.list(Object.keys(f).length > 0 ? f : null);
  }

  function getAsset(assetId) {
    if (!assetRepository) return Promise.resolve(null);
    return assetRepository.get(assetId);
  }

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

  return { getSystemStatus: getSystemStatus, listPublications: listPublications, getPublication: getPublication, listAssets: listAssets, getAsset: getAsset, getFeatureFlags: getFeatureFlags };
}
module.exports = { createAdminQueryService: createAdminQueryService };
