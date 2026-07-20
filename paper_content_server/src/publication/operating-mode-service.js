// operating-mode-service.js — Publication operating mode state machine
// Supported: AUTO, LEGACY_ADMIN_OVERRIDE, ONE_SHOT_OVERRIDE (with boundary expiry)
// Supported: FOCUS_LOCK (Phase 4 — explicit close to restore AUTO)
// Legacy NOT_IMPLEMENTED constants retained as 'IMPLEMENTED' for backward-compat assertions.

var MODE_AUTO = 'AUTO';
var MODE_LEGACY_ADMIN_OVERRIDE = 'LEGACY_ADMIN_OVERRIDE';
var MODE_ONE_SHOT_OVERRIDE = 'ONE_SHOT_OVERRIDE';
var MODE_FOCUS_LOCK = 'FOCUS_LOCK';
var MODE_MANUAL_NEWS = 'MANUAL_NEWS';
var MODE_MANUAL_PHOTO = 'MANUAL_PHOTO';

var IMPLEMENTED = 'IMPLEMENTED';

function OperatingModeService(initialMode) {
  var mode = initialMode === MODE_LEGACY_ADMIN_OVERRIDE ? MODE_LEGACY_ADMIN_OVERRIDE
           : initialMode === MODE_ONE_SHOT_OVERRIDE ? MODE_ONE_SHOT_OVERRIDE
           : initialMode === MODE_FOCUS_LOCK ? MODE_FOCUS_LOCK
           : initialMode === MODE_MANUAL_NEWS ? MODE_MANUAL_NEWS
           : initialMode === MODE_MANUAL_PHOTO ? MODE_MANUAL_PHOTO
           : MODE_AUTO;

  // ONE_SHOT context: { snapshotId, expiresAt (ISO string) }
  var oneShotContext = null;
  // FOCUS_LOCK context: { snapshotId, libraryType, theme?, albumId? }
  var focusLockContext = null;

  function getMode() { return mode; }

  function setMode(newMode) {
    if (newMode !== MODE_AUTO
        && newMode !== MODE_LEGACY_ADMIN_OVERRIDE
        && newMode !== MODE_ONE_SHOT_OVERRIDE
        && newMode !== MODE_FOCUS_LOCK
        && newMode !== MODE_MANUAL_NEWS
        && newMode !== MODE_MANUAL_PHOTO) {
      throw new Error('Unsupported mode: ' + newMode + '. Supported: '
        + MODE_AUTO + ', ' + MODE_LEGACY_ADMIN_OVERRIDE + ', '
        + MODE_ONE_SHOT_OVERRIDE + ', ' + MODE_FOCUS_LOCK + ', ' 
        + MODE_MANUAL_NEWS + ', ' + MODE_MANUAL_PHOTO);
    }
    mode = newMode;
  }

  function enterOneShot(snapshotId, expiresAt) {
    if (!snapshotId || typeof snapshotId !== 'string') {
      throw new Error('enterOneShot requires snapshotId');
    }
    var expiryIso = expiresAt instanceof Date ? expiresAt.toISOString()
                  : (typeof expiresAt === 'string' ? expiresAt : null);
    if (!expiryIso) throw new Error('enterOneShot requires expiresAt');
    mode = MODE_ONE_SHOT_OVERRIDE;
    oneShotContext = { snapshotId: snapshotId, expiresAt: expiryIso };
    focusLockContext = null;
  }

  function exitOneShot() {
    if (mode === MODE_ONE_SHOT_OVERRIDE) {
      mode = MODE_AUTO;
      oneShotContext = null;
    }
  }

  function getOneShotContext() { return oneShotContext; }

  // Returns true if ONE_SHOT has expired (current time >= expiresAt).
  function checkExpiry(now) {
    if (mode !== MODE_ONE_SHOT_OVERRIDE || !oneShotContext || !oneShotContext.expiresAt) return false;
    var nowMs = now instanceof Date ? now.getTime() : Date.now();
    var expiryMs = new Date(oneShotContext.expiresAt).getTime();
    return nowMs >= expiryMs;
  }

  function enterFocusLock(snapshotId, options) {
    if (!snapshotId || typeof snapshotId !== 'string') {
      throw new Error('enterFocusLock requires snapshotId');
    }
    options = options || {};
    mode = MODE_FOCUS_LOCK;
    focusLockContext = {
      snapshotId: snapshotId,
      libraryType: options.libraryType || null,
      theme: options.theme || null,
      albumId: options.albumId || null,
    };
    oneShotContext = null;
  }

  function exitFocusLock() {
    if (mode === MODE_FOCUS_LOCK) {
      mode = MODE_AUTO;
      focusLockContext = null;
    }
  }

  function getFocusLockContext() { return focusLockContext; }

  function reset() {
    mode = MODE_AUTO;
    oneShotContext = null;
    focusLockContext = null;
  }

  return {
    getMode: getMode,
    setMode: setMode,
    enterOneShot: enterOneShot,
    exitOneShot: exitOneShot,
    getOneShotContext: getOneShotContext,
    checkExpiry: checkExpiry,
    enterFocusLock: enterFocusLock,
    exitFocusLock: exitFocusLock,
    getFocusLockContext: getFocusLockContext,
    reset: reset,
    MODE_AUTO: MODE_AUTO,
    MODE_LEGACY_ADMIN_OVERRIDE: MODE_LEGACY_ADMIN_OVERRIDE,
    MODE_ONE_SHOT_OVERRIDE: MODE_ONE_SHOT_OVERRIDE,
    MODE_FOCUS_LOCK: MODE_FOCUS_LOCK,
    MODE_MANUAL_NEWS: MODE_MANUAL_NEWS,
    MODE_MANUAL_PHOTO: MODE_MANUAL_PHOTO,
    // Legacy capability constants (now implemented)
    ONE_SHOT_ROUTE: IMPLEMENTED,
    BOUNDARY_EXPIRY: IMPLEMENTED,
    FOCUS_LOCK: IMPLEMENTED,
  };
}

module.exports = {
  OperatingModeService: OperatingModeService,
  MODE_AUTO: MODE_AUTO,
  MODE_LEGACY_ADMIN_OVERRIDE: MODE_LEGACY_ADMIN_OVERRIDE,
  MODE_ONE_SHOT_OVERRIDE: MODE_ONE_SHOT_OVERRIDE,
  MODE_FOCUS_LOCK: MODE_FOCUS_LOCK,
  MODE_MANUAL_NEWS: MODE_MANUAL_NEWS,
  MODE_MANUAL_PHOTO: MODE_MANUAL_PHOTO,
};
