// admin-query-service.js — Read-only admin query service
function createAdminQueryService(snapshotStore, publicationHistory, assetRepository, featureFlags, logger) {
  logger = logger || {};

  function getSystemStatus() {
    var status = { timestamp: new Date().toISOString() };
    return snapshotStore.readActive().then(function(active) {
      if (active) { status.activeSnapshotId = active.activeSnapshotId; }
      // 之前 active 为 null 时调 load(null) → 读 snapshots/null.json（无意义且浪费 IO，
      // 若有人意外放了 null.json 会被当快照解析）。改为条件加载。
      return active ? snapshotStore.load(active.activeSnapshotId) : null;
    }).then(function(snap) {
      if (snap) { status.activeFrameId = snap.frameId; }
      return snapshotStore.listSnapshots();
    }).then(function(snapshots) {
      status.snapshotCount = snapshots.length;
      if (publicationHistory) return publicationHistory.latest();
    }).then(function(latest) {
      if (latest) status.lastPublicationAt = latest.publishedAt;
      // Feature flags (safe, no secrets). featureFlags is the feature-flag-view
      // module shape { getFeatureFlags: () => flagsDict }; call it and spread the
      // resulting plain dict. Spreading the view object itself would copy the
      // getFeatureFlags function key onto status.
      if (featureFlags && typeof featureFlags.getFeatureFlags === 'function') {
        var flags = featureFlags.getFeatureFlags();
        if (flags) { Object.keys(flags).forEach(function(k) { status[k] = flags[k]; }); }
      }
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
    // filter 可能为 null/undefined（外部输入），直接 filter.libraryType 抛 TypeError 导致服务崩溃。
    filter = filter || {};
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
    // Delegate to the injected feature-flag-view so the truth model reflects
    // actual runtime dependency state (mqtt connectedness, classifier readiness,
    // active frame id, etc.). Hardcoded values would lie to the admin UI.
    if (featureFlags && typeof featureFlags.getFeatureFlags === 'function') {
      return featureFlags.getFeatureFlags();
    }
    return Object.freeze({});
  }

  return { getSystemStatus: getSystemStatus, listPublications: listPublications, getPublication: getPublication, listAssets: listAssets, getAsset: getAsset, getFeatureFlags: getFeatureFlags };
}
module.exports = { createAdminQueryService: createAdminQueryService };
