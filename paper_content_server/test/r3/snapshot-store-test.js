#!/usr/bin/env node
// R3.1b: Snapshot store — persist, load, activate, list using R1 infra
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var snapshotModel = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));
var SnapshotStore = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-store')).SnapshotStore;

var tmpDir = path.join(os.tmpdir(), 'r3_snap_test_' + Date.now());
var snapDir = path.join(tmpDir, 'snapshots');
var pubDir = path.join(tmpDir, 'publication');

var store = SnapshotStore(snapDir, pubDir, { info: function(){}, warn: function(){}, error: function(){} });

t('STORE_EXISTS', typeof store.save === 'function' && typeof store.load === 'function' && typeof store.activate === 'function', '');

async function run() {
  // 1. Ensure directories created
  await store.ensureDirs();
  t('DIR_CREATED', fs.existsSync(snapDir) && fs.existsSync(pubDir), '');

  // 2. Save a news snapshot
  var frame = Buffer.alloc(16, 0xAA);
  var frameId = 'news:2026-07-11:test';
  var payload = { mode: 'news', title: 'R3 Test News', frameId: frameId };
  var snap = snapshotModel.createSnapshot(frameId, payload, frame, 'news');
  var savedId = await store.save(snap);
  t('SAVE_RETURNS_ID', savedId === snap.snapshotId, '');

  // 3. Verify files exist
  t('META_FILE', fs.existsSync(path.join(snapDir, snap.snapshotId + '.json')), '');
  t('FRAME_FILE', fs.existsSync(path.join(snapDir, snap.snapshotId + '.bin')), '');

  // 4. Load snapshot back
  var loaded = await store.load(snap.snapshotId);
  t('LOAD_SNAPSHOTID', loaded.snapshotId === snap.snapshotId, '');
  t('LOAD_FRAMEID', loaded.frameId === frameId, '');
  t('LOAD_FRAME_CONTENT', loaded.frame[0] === 0xAA && loaded.frame.length === 16, '');
  t('LOAD_PAYLOAD_TITLE', loaded.payload.title === 'R3 Test News', '');
  t('LOAD_MODE', loaded.mode === 'news', '');
  t('LOAD_FROZEN', Object.isFrozen(loaded), '');
  t('LOAD_SCHEMA_VERSION', loaded.schemaVersion === 1, '');

  // 5. Load non-existent snapshot
  var missing = await store.load('nonexistent');
  t('LOAD_NONEXISTENT', missing === null, '');

  // 6. Activate snapshot
  await store.activate(snap.snapshotId);
  var activeFile = path.join(pubDir, 'active-snapshot.json');
  t('ACTIVE_FILE_EXISTS', fs.existsSync(activeFile), '');
  var activeData = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
  t('ACTIVE_CONTENT', activeData.activeSnapshotId === snap.snapshotId, '');
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
  var photoFrame = Buffer.alloc(32, 0xBB);
  var photoSnap = snapshotModel.createSnapshot('photo:test:img', { mode: 'photo', title: 'Sunset' }, photoFrame, 'photo');
  await store.save(photoSnap);
  var loadedPhoto = await store.load(photoSnap.snapshotId);
  t('SAVE_LOAD_PHOTO', loadedPhoto.frame[0] === 0xBB && loadedPhoto.mode === 'photo' && loadedPhoto.payload.title === 'Sunset', '');

  // 10. List snapshots (should return newest first)
  var ids = await store.listSnapshots();
  t('LIST_CONTAINS_BOTH', ids.indexOf(snap.snapshotId) !== -1 && ids.indexOf(photoSnap.snapshotId) !== -1, '');
  t('LIST_NEWEST_FIRST', ids[0] === photoSnap.snapshotId, '');

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
