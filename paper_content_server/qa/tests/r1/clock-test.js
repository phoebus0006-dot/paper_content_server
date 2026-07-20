#!/usr/bin/env node
// R1.3: Clock abstraction test
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var clock = require(path.join(ROOT, 'src', 'infra', 'clock'));
t('SYSTEM_CLOCK_EXISTS', typeof clock.SystemClock === 'function', '');
t('FIXED_CLOCK_EXISTS', typeof clock.FixedClock === 'function', '');

// System clock returns real dates
var sys = clock.SystemClock();
var n = sys.now();
t('SYSTEM_NOW_IS_DATE', n instanceof Date, typeof n);
t('SYSTEM_NOWMS_IS_NUMBER', typeof sys.nowMs() === 'number', '');

// Fixed clock returns fixed time
var fixed = clock.FixedClock(new Date('2026-07-09T10:00:00Z'), 'Europe/Paris');
t('FIXED_NOW_FIXED', fixed.now().toISOString() === '2026-07-09T10:00:00.000Z', fixed.now().toISOString());
t('FIXED_TIMEZONE', fixed.timezone() === 'Europe/Paris', fixed.timezone());

// Advance
fixed.advanceMs(3600000);
t('FIXED_ADVANCE', fixed.now().toISOString() === '2026-07-09T11:00:00.000Z', fixed.now().toISOString());

// setTime
fixed.setTime(new Date('2026-07-10T00:00:00Z'));
t('FIXED_SETTIME', fixed.now().toISOString() === '2026-07-10T00:00:00.000Z', fixed.now().toISOString());

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
