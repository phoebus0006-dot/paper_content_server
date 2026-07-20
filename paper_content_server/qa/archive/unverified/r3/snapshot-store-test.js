#!/usr/bin/env node
// R3.1b: Snapshot store — persist, load, activate, list, integrity validation
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var snapshotModel = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));
var SnapshotStore = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-store')).SnapshotStore;
var SnapshotIntegrityError = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-store')).SnapshotIntegrityError;

function makeFrame() {
  var b = Buffer.alloc(192010);
  b.write('EPF1', 0, 'ascii'); b.writeUInt16LE(800, 4); b.writeUInt16LE(480, 6); b[8] = 49; b[9] = 1;
  return b;
}

var tmpDir = path.join(os.tmpdir(), 'r3_snap_test_' + Date.now());
var snapDir = path.join(tmpDir, 'snapshots');
var pubDir = path.join(tmpDir, 'publication');

var store = SnapshotStore(snapDir, pubDir, { info: function(){}, warn: function(){}, error: function(){} });

t('STORE_EXISTS', typeof store.save === 'function' && typeof store.load === 'function' && typeof store.activate === 'function', '');

async function run() {
  // 1. Ensure directories created
  await store.ensureDirs();
  t('DIR_CREATED', fs.existsSync(snapDir) && fs.existsSync(pubDir), '');

  // 2. Save a news snapshot (16-byte frame with EPF1 magic)
  var frame = makeFrame();
  var frameId = 'news:2026-07-11:test';
  var payload = { mode: 'news', title: 'R3 Test News', frameId: frameId };
  var snap = snapshotModel.createSnapshot(frameId, payload, frame, 'news');
  var savedId = await store.save(snap);
  t('SAVE_RETURNS_ID', savedId === snap.snapshotId, '');

  // 3. Verify files exist
  t('META_FILE', fs.existsSync(path.join(snapDir, snap.snapshotId + '.json')), '');
  t('FRAME_FILE', fs.existsSync(path.join(snapDir, snap.snapshotId + '.bin')), '');

  // 4. Load snapshot back with integrity validation
  var loaded = await store.load(snap.snapshotId);
  t('LOAD_SNAPSHOTID', loaded.snapshotId === snap.snapshotId, '');
  t('LOAD_FRAMEID', loaded.frameId === frameId, '');
  t('LOAD_FRAME_CONTENT', loaded.frame[0] === 0x45 && loaded.frame.length === 192010, '');
  t('LOAD_PAYLOAD_TITLE', loaded.payload.title === 'R3 Test News', '');
  t('LOAD_MODE', loaded.mode === 'news', '');
  t('LOAD_FROZEN', Object.isFrozen(loaded), '');
  t('LOAD_FRAME_SHA256', loaded.frameSha256 === snap.frameSha256, '');
  t('LOAD_FRAME_LENGTH', loaded.frameLength === 192010, '');
  t('LOAD_CONTENT_HASH', loaded.contentHash === snap.contentHash, '');
  t('LOAD_SCHEMA_VERSION', loaded.schemaVersion === 2, '');

  // 5. Load non-existent snapshot
  var missing = await store.load('nonexistent');
  t('LOAD_NONEXISTENT', missing === null, '');

  // 6. Activate snapshot
  await store.activate(snap.snapshotId);
  var activeFile = path.join(pubDir, 'active-snapshot.json');
  t('ACTIVE_FILE_EXISTS', fs.existsSync(activeFile), '');
  var activeData = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
  t('ACTIVE_SNAPSHOT_ID', activeData.activeSnapshotId === snap.snapshotId, '');
  t('ACTIVE_FRAME_SHA256', activeData.frameSha256 === snap.frameSha256, '');
  t('ACTIVE_FRAME_LENGTH', activeData.frameLength === 192010, '');
  t('ACTIVE_SCHEMA_VERSION', activeData.schemaVersion === 1, '');
  t('ACTIVE_UPDATED_AT', /^\d{4}-\d{2}-\d{2}T/.test(activeData.updatedAt), '');

  // 7. Read active
  var readActive = await store.readActive();
  t('READ_ACTIVE_ID', readActive.activeSnapshotId === snap.snapshotId, '');

  // 8. Read active with no active file
  var emptyStore = SnapshotStore(path.join(tmpDir, 'empty_snap'), path.join(tmpDir, 'empty_pub'));
  var noActive = await emptyStore.readActive();
  t('READ_ACTIVE_EMPTY', noActive === null, '');

  // 9. Save photo snapshot
  var photoFrame = makeFrame();
  var photoSnap = snapshotModel.createSnapshot('photo:test:img', { mode: 'photo', title: 'Sunset' }, photoFrame, 'photo');
  await store.save(photoSnap);
  var loadedPhoto = await store.load(photoSnap.snapshotId);
  t('SAVE_LOAD_PHOTO', loadedPhoto.frame[0] === 0x45 && loadedPhoto.mode === 'photo' && loadedPhoto.payload.title === 'Sunset', '');

  // 10. List snapshots (should return newest first)
  var ids = await store.listSnapshots();
  t('LIST_CONTAINS_BOTH', ids.indexOf(snap.snapshotId) !== -1 && ids.indexOf(photoSnap.snapshotId) !== -1, '');
  t('LIST_NEWEST_FIRST', ids[0] === photoSnap.snapshotId, '');

  // 11. Load corrupt metadata (wrong SHA256)
  var metaPath = path.join(snapDir, snap.snapshotId + '.json');
  var meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.frameSha256 = '0000000000000000000000000000000000000000000000000000000000000000';
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  try {
    await store.load(snap.snapshotId);
    t('CORRUPT_SHA256', false, 'should have thrown');
  } catch(e) {
    t('CORRUPT_SHA256', e.code === 'SNAPSHOT_INTEGRITY_ERROR', e.message);
  }

  // 12. Activate non-existent snapshot
  try {
    await store.activate('nonexistent');
    t('ACTIVATE_NONEXISTENT', false, 'should have thrown');
  } catch(e) {
    t('ACTIVATE_NONEXISTENT', true, e.message);
  }

  // Cleanup
  fs.rmdirSync(tmpDir, { recursive: true });
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(err) {
  console.log('CRASH: ' + err.message);
  try { fs.rmdirSync(tmpDir, { recursive: true }); } catch(e) {}
  process.exit(1);
});
