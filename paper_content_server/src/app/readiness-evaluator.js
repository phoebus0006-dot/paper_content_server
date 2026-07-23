// readiness-evaluator.js — Authoritative application readiness evaluation
// Evaluates readiness across server.js and /health/ready endpoints without re-reading heavy files.

function evaluateReadiness(runtime, boot) {
  var issues = [];
  var R = runtime || {};

  if (boot && typeof boot.getState === 'function' && boot.getState() !== 'ready') {
    issues.push({ code: 'BOOTSTRAP_NOT_READY', component: 'bootstrap' });
  }

  if (!R.snapshotStore) {
    issues.push({ code: 'SNAPSHOT_STORE_UNAVAILABLE', component: 'snapshotStore' });
  }

  if (!R.publicationService) {
    issues.push({ code: 'PUBLICATION_SERVICE_UNAVAILABLE', component: 'publicationService' });
  }

  if (!R.deviceRegistryService) {
    issues.push({ code: 'DEVICE_REGISTRY_UNAVAILABLE', component: 'deviceRegistry' });
  }

  if (!R.feeds || !Array.isArray(R.feeds) || R.feeds.length === 0 || R.feeds.filter(function(f) { return f && f.enabled !== false; }).length === 0) {
    issues.push({ code: 'FEEDS_CONFIG_INVALID', component: 'feeds' });
  }

  var isReady = issues.length === 0;
  return {
    isReady: isReady,
    status: isReady ? 'ready' : 'not_ready',
    issues: issues,
  };
}

module.exports = {
  evaluateReadiness: evaluateReadiness,
};
