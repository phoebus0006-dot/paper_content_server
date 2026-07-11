#!/usr/bin/env node
// R3.1a: Snapshot model — immutable factory, validation, serialization
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var snapshot = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));

t('MODULE_EXPORTS', typeof snapshot.createSnapshot === 'function' && typeof snapshot.serializeMeta === 'function', '');

// 1. Create a valid news snapshot
var frame = Buffer.alloc(8, 0xAA);
var payload = { mode: 'news', title: 'Test News', frameId: 'news:test:123' };
var snap = snapshot.createSnapshot('news:test:123', payload, frame, 'news');
t('CREATE_NEWS', snap.snapshotId.startsWith('snap_') && snap.frameId === 'news:test:123', 'id=' + snap.snapshotId);
t('FROZEN', Object.isFrozen(snap), '');
t('MODE', snap.mode === 'news', '');
t('PAYLOAD_REF', snap.payload === payload, '');
t('FRAME_REF', snap.frame === frame, '');
t('SCHEMA_VERSION', snap.schemaVersion === 1, '');
t('CREATED_AT_ISO', /^\d{4}-\d{2}-\d{2}T/.test(snap.createdAt), '');

// 2. Create a valid photo snapshot
var snap2 = snapshot.createSnapshot('photo:test:456', { mode: 'photo' }, Buffer.alloc(4, 0xBB), 'photo');
t('CREATE_PHOTO', snap2.snapshotId.startsWith('snap_') && snap2.frameId === 'photo:test:456', '');

// 3. Reject invalid inputs
try { snapshot.createSnapshot('', {}, Buffer.alloc(1), 'news'); t('REJECT_EMPTY_FRAMEID', false, ''); }
catch(e) { t('REJECT_EMPTY_FRAMEID', true, e.message); }

try { snapshot.createSnapshot('x', 'not-object', Buffer.alloc(1), 'news'); t('REJECT_INVALID_PAYLOAD', false, ''); }
catch(e) { t('REJECT_INVALID_PAYLOAD', true, e.message); }

try { snapshot.createSnapshot('x', {}, Buffer.alloc(0), 'news'); t('REJECT_EMPTY_FRAME', false, ''); }
catch(e) { t('REJECT_EMPTY_FRAME', true, e.message); }

try { snapshot.createSnapshot('x', {}, Buffer.alloc(1), 'invalid'); t('REJECT_INVALID_MODE', false, ''); }
catch(e) { t('REJECT_INVALID_MODE', true, e.message); }

// 4. serializeMeta excludes frame
var meta = snapshot.serializeMeta(snap);
t('SERIALIZE_META_INCLUDES_SNAPSHOTID', meta.snapshotId === snap.snapshotId, '');
t('SERIALIZE_META_EXCLUDES_FRAME', meta.frame === undefined, '');
t('SERIALIZE_META_EXCLUDES_BUFFER', !Buffer.isBuffer(meta.frame), '');

// 5. Unique snapshot IDs
t('UNIQUE_IDS', snap.snapshotId !== snap2.snapshotId, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
