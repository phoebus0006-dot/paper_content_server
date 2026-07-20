#!/usr/bin/env node
// R3.3c: OperatingModeService — AUTO / LEGACY_ADMIN_OVERRIDE

var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var OperatingModeService = require(path.join(ROOT, 'src', 'publication', 'operating-mode-service')).OperatingModeService;
var MODE_AUTO = require(path.join(ROOT, 'src', 'publication', 'operating-mode-service')).MODE_AUTO;
var MODE_LEGACY_ADMIN_OVERRIDE = require(path.join(ROOT, 'src', 'publication', 'operating-mode-service')).MODE_LEGACY_ADMIN_OVERRIDE;

t('MODE_CONSTANTS', MODE_AUTO === 'AUTO' && MODE_LEGACY_ADMIN_OVERRIDE === 'LEGACY_ADMIN_OVERRIDE', '');

// 1. Default mode is AUTO
var svc = OperatingModeService();
t('DEFAULT_MODE', svc.getMode() === 'AUTO', '');

// 2. Explicit AUTO
var svc2 = OperatingModeService('AUTO');
t('EXPLICIT_AUTO', svc2.getMode() === 'AUTO', '');

// 3. LEGACY_ADMIN_OVERRIDE
var svc3 = OperatingModeService('LEGACY_ADMIN_OVERRIDE');
t('LEGACY_MODE', svc3.getMode() === 'LEGACY_ADMIN_OVERRIDE', '');

// 4. Set mode
var svc4 = OperatingModeService();
svc4.setMode('LEGACY_ADMIN_OVERRIDE');
t('SET_LEGACY', svc4.getMode() === 'LEGACY_ADMIN_OVERRIDE', '');
svc4.setMode('AUTO');
t('SET_AUTO', svc4.getMode() === 'AUTO', '');

// 5. Reject invalid mode
try { svc4.setMode('INVALID'); t('REJECT_INVALID', false, ''); }
catch(e) { t('REJECT_INVALID', true, e.message); }

// 6. Implemented capability constants (Phase 3/4: ONE_SHOT/BOUNDARY_EXPIRY/FOCUS_LOCK now implemented)
t('ONE_SHOT_IMPLEMENTED', svc.ONE_SHOT_ROUTE === 'IMPLEMENTED', '');
t('BOUNDARY_EXPIRY_IMPLEMENTED', svc.BOUNDARY_EXPIRY === 'IMPLEMENTED', '');
t('FOCUS_LOCK_IMPLEMENTED', svc.FOCUS_LOCK === 'IMPLEMENTED', '');

// 6b. ONE_SHOT state machine
var osSvc = OperatingModeService();
t('ONESHOT_DEFAULT_AUTO', osSvc.getMode() === 'AUTO', '');
osSvc.enterOneShot('snap_test_1', new Date(Date.now() + 60000).toISOString());
t('ONESHOT_ENTERED', osSvc.getMode() === 'ONE_SHOT_OVERRIDE', '');
t('ONESHOT_CONTEXT', osSvc.getOneShotContext() && osSvc.getOneShotContext().snapshotId === 'snap_test_1', '');
t('ONESHOT_NOT_EXPIRED', osSvc.checkExpiry(new Date()) === false, '');
t('ONESHOT_EXPIRED', osSvc.checkExpiry(new Date(Date.now() + 120000)) === true, '');
osSvc.exitOneShot();
t('ONESHOT_EXIT_TO_AUTO', osSvc.getMode() === 'AUTO', '');
t('ONESHOT_CONTEXT_CLEARED', osSvc.getOneShotContext() === null, '');

// 6c. FOCUS_LOCK state machine
var flSvc = OperatingModeService();
flSvc.enterFocusLock('snap_fl_1', { libraryType: 'custom', theme: 'dialogue' });
t('FOCUSLOCK_ENTERED', flSvc.getMode() === 'FOCUS_LOCK', '');
t('FOCUSLOCK_CONTEXT', flSvc.getFocusLockContext() && flSvc.getFocusLockContext().libraryType === 'custom', '');
flSvc.exitFocusLock();
t('FOCUSLOCK_EXIT_TO_AUTO', flSvc.getMode() === 'AUTO', '');
t('FOCUSLOCK_CONTEXT_CLEARED', flSvc.getFocusLockContext() === null, '');

// 7. Mode constants on instance
t('INSTANCE_MODE_AUTO', svc.MODE_AUTO === 'AUTO', '');
t('INSTANCE_MODE_LEGACY', svc.MODE_LEGACY_ADMIN_OVERRIDE === 'LEGACY_ADMIN_OVERRIDE', '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
