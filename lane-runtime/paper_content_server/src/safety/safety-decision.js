// safety-decision.js — Decision model for asset deletion
// Only accepts UNSAFE, SUSPICIOUS, or POLICY_BLOCKED assets
// SAFE assets cannot be deleted through this pipeline

var ALLOWED_DELETE_REASONS = ['UNSAFE','SUSPICIOUS','POLICY_BLOCKED'];
var UNSAFE_SAFETY_STATUSES = ['UNSAFE','SUSPICIOUS'];

function canDelete(asset, reason) {
  if (!asset) return false;
  if (ALLOWED_DELETE_REASONS.indexOf(reason) < 0) return false;
  if (asset.lifecycleStatus === 'TOMBSTONED' || asset.lifecycleStatus === 'DELETED') return false;
  // SAFE assets cannot be deleted
  if (asset.safetyStatus === 'SAFE') return false;
  // Reason must align with asset state
  if (reason === 'UNSAFE' && UNSAFE_SAFETY_STATUSES.indexOf(asset.safetyStatus) < 0) return false;
  return true;
}

function assertCanDelete(asset, reason) {
  if (!canDelete(asset, reason)) {
    throw new Error('Asset ' + (asset ? asset.assetId : 'null') + ' cannot be deleted: reason=' + reason +
      ' safety=' + (asset ? asset.safetyStatus : 'N/A') + ' lifecycle=' + (asset ? asset.lifecycleStatus : 'N/A'));
  }
}

module.exports = { canDelete, assertCanDelete, ALLOWED_DELETE_REASONS };
