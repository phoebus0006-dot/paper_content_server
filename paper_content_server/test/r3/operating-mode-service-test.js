#!/usr/bin/env node
// R3.3c: OperatingModeService — AUTO / LEGACY_ADMIN_OVERRIDE

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
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

// 6. NOT_IMPLEMENTED constants
t('ONE_SHOT_NOT_IMPLEMENTED', svc.ONE_SHOT_ROUTE === 'NOT_IMPLEMENTED', '');
t('BOUNDARY_EXPIRY_NOT_IMPLEMENTED', svc.BOUNDARY_EXPIRY === 'NOT_IMPLEMENTED', '');
t('FOCUS_LOCK_NOT_IMPLEMENTED', svc.FOCUS_LOCK === 'NOT_IMPLEMENTED', '');

// 7. Mode constants on instance
t('INSTANCE_MODE_AUTO', svc.MODE_AUTO === 'AUTO', '');
t('INSTANCE_MODE_LEGACY', svc.MODE_LEGACY_ADMIN_OVERRIDE === 'LEGACY_ADMIN_OVERRIDE', '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
