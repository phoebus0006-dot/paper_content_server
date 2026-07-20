#!/usr/bin/env node
// R3.2b: PinStore — TTL-based per-client pin with hit/miss TTLs

var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var PinStore = require(path.join(ROOT, 'src', 'snapshot', 'pin-store')).PinStore;
var HIT_TTL = require(path.join(ROOT, 'src', 'snapshot', 'pin-store')).HIT_TTL_MS;
var MISS_TTL = require(path.join(ROOT, 'src', 'snapshot', 'pin-store')).MISS_TTL_MS;

t('MODULE_EXISTS', typeof PinStore === 'function', '');
t('HIT_TTL', HIT_TTL === 29000, '' + HIT_TTL);
t('MISS_TTL', MISS_TTL === 31000, '' + MISS_TTL);

// Use a fake clock for deterministic TTL testing
var fakeNow = 1000000;
var clock = { nowMs: function() { return fakeNow; } };
var store = PinStore(clock);

// 1. Empty pin
t('GET_EMPTY', store.get('client-1') === null, '');
t('SIZE_EMPTY', store.size() === 0, '');

// 2. Pin hit
store.pin('client-1', 'snap_abc');
t('PIN_GET', store.get('client-1') === 'snap_abc', '');
t('SIZE_1', store.size() === 1, '');

// 3. Pin miss
store.pinMiss('client-2');
t('PIN_MISS_GET', store.get('client-2') === null, ''); // miss pins return null
t('SIZE_2', store.size() === 2, '');

// 4. Hit pin expires after HIT_TTL (29s)
fakeNow += 29000;
t('HIT_STILL_VALID', store.get('client-1') === 'snap_abc', '');
fakeNow += 1; // 29001ms
t('HIT_EXPIRED', store.get('client-1') === null, '');

// 5. Miss pin expires after MISS_TTL (31s)
store.pinMiss('client-3');
fakeNow += 31000;
t('MISS_STILL_VALID', store.get('client-3') === null, '');
fakeNow += 1;
t('MISS_EXPIRED', store.get('client-3') === null, ''); // already deleted by get

// 6. Unpin
store.pin('client-4', 'snap_xyz');
t('BEFORE_UNPIN', store.get('client-4') === 'snap_xyz', '');
store.unpin('client-4');
t('AFTER_UNPIN', store.get('client-4') === null, '');

// 7. GC
store.pin('client-gc1', 'snap_gc1');
store.pin('client-gc2', 'snap_gc2');
fakeNow += 29001; // both hit-pins expired
store.gc();
t('GC_REMOVES_EXPIRED', store.size() === 0, '');

// 8. Multiple clients
store.pin('alice', 'snap_alice');
store.pin('bob', 'snap_bob');
t('MULTI_CLIENT_ALICE', store.get('alice') === 'snap_alice', '');
t('MULTI_CLIENT_BOB', store.get('bob') === 'snap_bob', '');

// 9. Clear
store.clear();
t('CLEAR', store.size() === 0 && store.get('alice') === null, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
