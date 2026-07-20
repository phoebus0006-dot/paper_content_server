#!/usr/bin/env node
// R3.1a: Snapshot model — immutable factory, integrity fields, validation, serialization
var path = require('path');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var snapshot = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));

t('MODULE_EXPORTS', typeof snapshot.createSnapshot === 'function', '');

// 1. Create a valid news snapshot
var frame = Buffer.alloc(8, 0xAA);
var payload = { mode: 'news', title: 'Test News', frameId: 'news:test:123' };
var snap = snapshot.createSnapshot('news:test:123', payload, frame, 'news');
t('CREATE_NEWS', snap.snapshotId.startsWith('snap_') && snap.frameId === 'news:test:123', 'id=' + snap.snapshotId);
t('FROZEN', Object.isFrozen(snap), '');
t('MODE', snap.mode === 'news', '');
t('PAYLOAD_REF', snap.payload === payload, '');
t('FRAME_REF', snap.frame === frame, '');

// Integrity fields
t('FRAME_SHA256', typeof snap.frameSha256 === 'string' && snap.frameSha256.length === 64, 'sha=' + snap.frameSha256);
var expectedSha = crypto.createHash('sha256').update(frame).digest('hex');
t('FRAME_SHA256_MATCH', snap.frameSha256 === expectedSha, '');
t('FRAME_LENGTH', snap.frameLength === 8, 'len=' + snap.frameLength);
t('CONTENT_HASH', typeof snap.contentHash === 'string' && snap.contentHash.length === 16, 'hash=' + snap.contentHash);
t('SCHEMA_VERSION', snap.schemaVersion === 2, '' + snap.schemaVersion);
t('CREATED_AT_ISO', /^\d{4}-\d{2}-\d{2}T/.test(snap.createdAt), '');

// 2. Create a valid photo snapshot
var photoFrame = Buffer.alloc(4, 0xBB);
var snap2 = snapshot.createSnapshot('photo:test:456', { mode: 'photo' }, photoFrame, 'photo');
t('CREATE_PHOTO', snap2.snapshotId.startsWith('snap_') && snap2.frameId === 'photo:test:456', '');
var expectedSha2 = crypto.createHash('sha256').update(photoFrame).digest('hex');
t('PHOTO_FRAME_SHA256', snap2.frameSha256 === expectedSha2, '');
t('PHOTO_FRAME_LENGTH', snap2.frameLength === 4, '');

// 3. contentHash stability (same identity = same hash)
var snap3 = snapshot.createSnapshot('news:test:123', { mode: 'news', title: 'Test News' }, Buffer.alloc(8, 0xAA), 'news');
t('CONTENT_HASH_STABLE', snap.contentHash === snap3.contentHash, '');

// 4. Reject invalid inputs
try { snapshot.createSnapshot('', {}, Buffer.alloc(1), 'news'); t('REJECT_EMPTY_FRAMEID', false, ''); }
catch(e) { t('REJECT_EMPTY_FRAMEID', true, e.message); }
try { snapshot.createSnapshot('x', 'not-object', Buffer.alloc(1), 'news'); t('REJECT_INVALID_PAYLOAD', false, ''); }
catch(e) { t('REJECT_INVALID_PAYLOAD', true, e.message); }
try { snapshot.createSnapshot('x', {}, Buffer.alloc(0), 'news'); t('REJECT_EMPTY_FRAME', false, ''); }
catch(e) { t('REJECT_EMPTY_FRAME', true, e.message); }
try { snapshot.createSnapshot('x', {}, Buffer.alloc(1), 'invalid'); t('REJECT_INVALID_MODE', false, ''); }
catch(e) { t('REJECT_INVALID_MODE', true, e.message); }

// 5. serializeMeta includes integrity fields, excludes frame
var meta = snapshot.serializeMeta(snap);
t('META_INCLUDES_SNAPSHOTID', meta.snapshotId === snap.snapshotId, '');
t('META_INCLUDES_FRAME_SHA256', meta.frameSha256 === snap.frameSha256, '');
t('META_INCLUDES_FRAME_LENGTH', meta.frameLength === 8, '');
t('META_INCLUDES_CONTENT_HASH', meta.contentHash === snap.contentHash, '');
t('META_EXCLUDES_FRAME', meta.frame === undefined, '');
t('META_EXCLUDES_BUFFER', !Buffer.isBuffer(meta.frame), '');

// 6. Unique snapshot IDs
t('UNIQUE_IDS', snap.snapshotId !== snap2.snapshotId && snap.snapshotId !== snap3.snapshotId, '');

// 7. computeFrameSha256 export
t('COMPUTE_FN_EXISTS', typeof snapshot.computeFrameSha256 === 'function', '');
t('COMPUTE_FN_MATCH', snapshot.computeFrameSha256(frame) === expectedSha, '');

// 8. ERR_INTEGRITY constant
t('ERR_INTEGRITY', snapshot.ERR_INTEGRITY === 'SNAPSHOT_INTEGRITY_ERROR', '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
