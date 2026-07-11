// operating-mode-service.js — Publication operating mode
// Supported: AUTO, LEGACY_ADMIN_OVERRIDE
// NOT_IMPLEMENTED: ONE_SHOT_ROUTE, BOUNDARY_EXPIRY, FOCUS_LOCK

var MODE_AUTO = 'AUTO';
var MODE_LEGACY_ADMIN_OVERRIDE = 'LEGACY_ADMIN_OVERRIDE';

var NOT_IMPLEMENTED = 'NOT_IMPLEMENTED';

function OperatingModeService(initialMode) {
  var mode = initialMode === MODE_LEGACY_ADMIN_OVERRIDE ? MODE_LEGACY_ADMIN_OVERRIDE : MODE_AUTO;

  function getMode() {
    return mode;
  }

  function setMode(newMode) {
    if (newMode !== MODE_AUTO && newMode !== MODE_LEGACY_ADMIN_OVERRIDE) {
      throw new Error('Unsupported mode: ' + newMode + '. Supported: ' + MODE_AUTO + ', ' + MODE_LEGACY_ADMIN_OVERRIDE);
    }
    mode = newMode;
  }

  return {
    getMode: getMode,
    setMode: setMode,
    MODE_AUTO: MODE_AUTO,
    MODE_LEGACY_ADMIN_OVERRIDE: MODE_LEGACY_ADMIN_OVERRIDE,
    ONE_SHOT_ROUTE: NOT_IMPLEMENTED,
    BOUNDARY_EXPIRY: NOT_IMPLEMENTED,
    FOCUS_LOCK: NOT_IMPLEMENTED,
  };
}

module.exports = { OperatingModeService: OperatingModeService, MODE_AUTO: MODE_AUTO, MODE_LEGACY_ADMIN_OVERRIDE: MODE_LEGACY_ADMIN_OVERRIDE };
