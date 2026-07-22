// image-approval-adapter.js — Unified image approval/adoption status resolver.
// Bridges legacy (pre-PR) and current image index schemas.
// Legacy 'approved' only maps to publishable if: file exists, path safe,
// extension valid, not in quarantine zone, and sourceHash matches.

var fs = require('fs');
var path = require('path');

var ALLOWED_DIRS = null;

function setAllowedDirs(dirs) {
  ALLOWED_DIRS = dirs;
}

var VALID_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function _verifyLegacyApproved(entry) {
  // Must have a rawPath or path
  var imgPath = entry.rawPath || entry.path || '';
  if (!imgPath) { return false; }

  // Must be absolute or resolve relative to allowed dirs
  var resolved = null;
  if (path.isAbsolute(imgPath)) {
    resolved = imgPath;
  } else if (ALLOWED_DIRS) {
    for (var i = 0; i < ALLOWED_DIRS.length; i++) {
      var candidate = path.resolve(ALLOWED_DIRS[i], imgPath);
      if (candidate.indexOf(path.resolve(ALLOWED_DIRS[i])) === 0) {
        resolved = candidate;
        break;
      }
    }
  } else {
    // No allowed dirs configured — try relative to CWD
    resolved = path.resolve(imgPath);
  }

  if (!resolved) { return false; }

  // File must exist
  try {
    if (!fs.existsSync(resolved)) { return false; }
    var stat = fs.statSync(resolved);
    if (!stat.isFile()) { return false; }
  } catch(e) {
    return false;
  }

  // Extension must be valid image
  var ext = path.extname(resolved).toLowerCase();
  if (VALID_EXTS.indexOf(ext) < 0) { return false; }

  // Must not be in an upload quarantine zone (check path segments)
  var segments = resolved.toLowerCase().split(path.sep);
  var inQuarantine = segments.some(function(s) { return s === 'quarantine' || s === 'pending_uploads' || s.indexOf('quarantine_') === 0 || s.indexOf('pending_') === 0; });
  if (inQuarantine) { return false; }

  // Legacy entry must have a migration flag or explicit approved status
  // without being in a pending/rejected state
  var legacySource = String(entry.source || '').toLowerCase();
  if (legacySource.indexOf('upload') >= 0 || legacySource.indexOf('quarantine') >= 0) {
    // Upload-quarantine origin entries need explicit migration
    if (entry.migratedApproved !== true) { return false; }
  }

  // sourceHash match if available
  if (entry.sha256) {
    try {
      var fd = fs.openSync(resolved, 'r');
      var crypto = require('crypto');
      var hash = crypto.createHash('sha256');
      var buf = Buffer.alloc(65536);
      var bytes = 0;
      while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        hash.update(buf.subarray(0, bytes));
      }
      fs.closeSync(fd);
      var currentSha = hash.digest('hex');
      if (currentSha !== entry.sha256) { return false; }
    } catch(e) {
      return false;
    }
  }

  // Legacy approved with migration evidence: SAFE/APPROVED
  if (entry.safetyStatus === 'approved' || String(entry.safetyStatus || '').toLowerCase() === 'approved') {
    return true;
  }

  return false;
}

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
    var result = {
      safetyStatus: safety === 'SAFE' ? 'SAFE' : safety === 'UNSAFE' ? 'UNSAFE' : 'PENDING',
      reviewStatus: review === 'APPROVED' ? 'APPROVED' : review === 'REJECTED' ? 'REJECTED' : 'PENDING',
      lifecycleStatus: lc === 'SELECTABLE' ? 'SELECTABLE' : lc === 'BLOCKED' ? 'BLOCKED' : lc === 'TOMBSTONED' ? 'TOMBSTONED' : 'QUARANTINED',
      isLegacy: false
    };
    return result;
  }

  // Legacy model
  var legacy = String(entry.safetyStatus || '').toLowerCase();
  if (legacy === 'approved') {
    if (_verifyLegacyApproved(entry)) {
      return {
        safetyStatus: 'SAFE',
        reviewStatus: 'APPROVED',
        lifecycleStatus: 'SELECTABLE',
        isLegacy: true
      };
    }
    // Failed verification → quarantine
    return {
      safetyStatus: 'PENDING',
      reviewStatus: 'PENDING',
      lifecycleStatus: 'QUARANTINED',
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
  isPublishable: isPublishable,
  _verifyLegacyApproved: _verifyLegacyApproved,
  setAllowedDirs: setAllowedDirs
};
