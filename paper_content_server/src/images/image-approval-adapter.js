// image-approval-adapter.js — Unified image approval/adoption status resolver.
// Bridges legacy (pre-PR) and current image index schemas.
// Do NOT modify this file to change the model; modify the legacy mapping rules.

function resolveStatus(entry) {
  if (!entry || typeof entry !== 'object') {
    return defaultPending();
  }

  var safety = String(entry.safetyStatus || '').toUpperCase();
  var review = String(entry.reviewStatus || '').toUpperCase();
  var lifecycle = String(entry.lifecycleStatus || '').toUpperCase();

  // Already current model
  if (safety && review) {
    var lc = lifecycle;
    if (!lc && safety === 'SAFE' && review === 'APPROVED') lc = 'SELECTABLE';
    else if (!lc) lc = 'QUARANTINED';
    return {
      safetyStatus: safety === 'SAFE' ? 'SAFE' : safety === 'UNSAFE' ? 'UNSAFE' : 'PENDING',
      reviewStatus: review === 'APPROVED' ? 'APPROVED' : review === 'REJECTED' ? 'REJECTED' : 'PENDING',
      lifecycleStatus: lc === 'SELECTABLE' ? 'SELECTABLE' : lc === 'BLOCKED' ? 'BLOCKED' : lc === 'TOMBSTONED' ? 'TOMBSTONED' : 'QUARANTINED',
      isLegacy: false
    };
  }

  // Legacy model: safetyStatus=approved/pending/rejected (lowercase)
  var legacy = String(entry.safetyStatus || '').toLowerCase();
  if (legacy === 'approved') {
    return {
      safetyStatus: 'SAFE',
      reviewStatus: 'APPROVED',
      lifecycleStatus: 'SELECTABLE',
      isLegacy: true
    };
  }
  if (legacy === 'pending') {
    return {
      safetyStatus: 'PENDING',
      reviewStatus: 'PENDING',
      lifecycleStatus: 'QUARANTINED',
      isLegacy: true
    };
  }
  if (legacy === 'rejected' || legacy === 'unsafe') {
    return {
      safetyStatus: 'UNSAFE',
      reviewStatus: 'REJECTED',
      lifecycleStatus: 'TOMBSTONED',
      isLegacy: true
    };
  }

  // Unknown legacy: quarantine
  return {
    safetyStatus: 'PENDING',
    reviewStatus: 'PENDING',
    lifecycleStatus: 'QUARANTINED',
    isLegacy: true
  };
}

function defaultPending() {
  return {
    safetyStatus: 'PENDING',
    reviewStatus: 'PENDING',
    lifecycleStatus: 'QUARANTINED',
    isLegacy: false
  };
}

function isPublishable(entry) {
  var r = resolveStatus(entry);
  return r.safetyStatus === 'SAFE' && r.reviewStatus === 'APPROVED' && r.lifecycleStatus === 'SELECTABLE';
}

module.exports = {
  resolveStatus: resolveStatus,
  isPublishable: isPublishable
};
