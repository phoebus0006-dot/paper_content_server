#!/usr/bin/env node
// R3.2a: Snapshot cache — in-memory LRU caching

var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var SnapshotCache = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-cache')).SnapshotCache;

var cache = SnapshotCache(3); // max 3 entries

t('CACHE_EXISTS', typeof cache.get === 'function' && typeof cache.set === 'function', '');

// 1. Empty cache
t('GET_MISS', cache.get('nonexistent') === null, '');
t('SIZE_EMPTY', cache.size() === 0, '');

// 2. Set and get
var obj1 = { snapshotId: 'snap_1', data: 'first' };
cache.set('snap_1', obj1);
t('GET_HIT', cache.get('snap_1') === obj1, '');
t('SIZE_1', cache.size() === 1, '');
t('HAS', cache.has('snap_1'), '');

// 3. Multiple entries
var obj2 = { snapshotId: 'snap_2', data: 'second' };
cache.set('snap_2', obj2);
t('SIZE_2', cache.size() === 2, '');
t('GET_2', cache.get('snap_2') === obj2, '');

// 4. LRU eviction (max=3, adding 4th evicts oldest)
var obj3 = { snapshotId: 'snap_3', data: 'third' };
cache.set('snap_3', obj3);
var obj4 = { snapshotId: 'snap_4', data: 'fourth' };
cache.set('snap_4', obj4);
t('SIZE_AFTER_EVICT', cache.size() === 3, 'size=' + cache.size());
t('EVICTED_OLDEST', cache.get('snap_1') === null, 'snap_1 was evicted');
t('RETAINED_2', cache.get('snap_2') === obj2, '');
t('RETAINED_3', cache.get('snap_3') === obj3, '');
t('RETAINED_4', cache.get('snap_4') === obj4, '');

// 5. Re-set refreshes position
cache.set('snap_2', obj2); // refresh snap_2
var obj5 = { snapshotId: 'snap_5', data: 'fifth' };
cache.set('snap_5', obj5); // should evict snap_3 (oldest after snap_2 refresh)
t('EVICTED_3_AFTER_REFRESH', cache.get('snap_3') === null, '');
t('RETAINED_2_REFRESHED', cache.get('snap_2') === obj2, '');

// 6. Delete
cache.delete('snap_4');
t('DELETE', cache.get('snap_4') === null, '');
t('SIZE_AFTER_DELETE', cache.size() === 2, '');

// 7. Clear
cache.clear();
t('CLEAR', cache.size() === 0 && cache.get('snap_2') === null, '');

// 8. Keys
cache.set('a', {});
cache.set('b', {});
var keys = cache.keys();
t('KEYS', keys.length === 2 && keys.indexOf('a') !== -1 && keys.indexOf('b') !== -1, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
