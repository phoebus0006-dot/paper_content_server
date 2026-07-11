#!/usr/bin/env node
// R3.3e: PublicationService — unified publish command handler

var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var snapshotModel = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));
var SnapshotStore = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-store')).SnapshotStore;
var SnapshotCache = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-cache')).SnapshotCache;
var PinStore = require(path.join(ROOT, 'src', 'snapshot', 'pin-store')).PinStore;
var PublicationLock = require(path.join(ROOT, 'src', 'publication', 'publication-lock')).PublicationLock;
var NoopNotificationPort = require(path.join(ROOT, 'src', 'publication', 'notification-port')).NoopNotificationPort;
var OperatingModeService = require(path.join(ROOT, 'src', 'publication', 'operating-mode-service')).OperatingModeService;
var PublicationHistory = require(path.join(ROOT, 'src', 'publication', 'publication-history')).PublicationHistory;
var PublicationService = require(path.join(ROOT, 'src', 'publication', 'publication-service')).PublicationService;

var tmpDir = path.join(os.tmpdir(), 'r3_pub_test_' + Date.now());
var snapDir = path.join(tmpDir, 'snapshots');
var pubDir = path.join(tmpDir, 'publication');
var histFile = path.join(tmpDir, 'history.json');
var logger = { info: function(){}, warn: function(){}, error: function(){} };

var store = SnapshotStore(snapDir, pubDir, logger);
var cache = SnapshotCache();
var pinStore = PinStore();
var lock = PublicationLock();
var notif = NoopNotificationPort();
var modeSvc = OperatingModeService();
var history = PublicationHistory(histFile, logger);
var pubSvc = PublicationService(store, cache, pinStore, lock, notif, modeSvc, history, logger);

t('SVC_EXISTS', typeof pubSvc.publish === 'function' && typeof pubSvc.getActive === 'function' && typeof pubSvc.rollback === 'function', '');

async function run() {
  // 1. Publish a news snapshot
  var frame = Buffer.alloc(16, 0xAA);
  var snap = snapshotModel.createSnapshot('news:r3-test:1', { mode: 'news', title: 'R3 Integration Test' }, frame, 'news');
  var snapId = await pubSvc.publish(snap);
  t('PUBLISH_RETURNS_ID', snapId === snap.snapshotId, '');

  // 2. Get active snapshot
  var active = await pubSvc.getActive();
  t('ACTIVE_EXISTS', active !== null, '');
  t('ACTIVE_SNAPSHOTID', active.snapshotId === snap.snapshotId, '');
  t('ACTIVE_FRAME_CONTENT', active.frame[0] === 0xAA, '');
  t('ACTIVE_FROZEN', Object.isFrozen(active), '');

  // 3. Active is served from cache (same object reference)
  var active2 = await pubSvc.getActive();
  t('ACTIVE_CACHED', active2 === active, 'same ref');

  // 4. History has publish entry
  var entries = await history.list();
  t('HISTORY_HAS_ENTRY', entries.length === 1 && entries[0].snapshotId === snap.snapshotId && entries[0].type === 'news', '');

  // 5. Publish a photo snapshot
  var photoFrame = Buffer.alloc(32, 0xBB);
  var photoSnap = snapshotModel.createSnapshot('photo:r3-test:img', { mode: 'photo', title: 'Sunset' }, photoFrame, 'photo');
  var photoId = await pubSvc.publish(photoSnap);
  var activePhoto = await pubSvc.getActive();
  t('ACTIVE_PHOTO_FRAME', activePhoto.frame[0] === 0xBB && activePhoto.mode === 'photo', '');

  // 6. Rollback to first snapshot
  var rbId = await pubSvc.rollback(snap.snapshotId);
  t('ROLLBACK_RETURNS_ID', rbId === snap.snapshotId, '');
  var activeRb = await pubSvc.getActive();
  t('ROLLBACK_ACTIVE', activeRb.snapshotId === snap.snapshotId && activeRb.frame[0] === 0xAA, '');

  // 7. Rollback to non-existent
  try {
    await pubSvc.rollback('nonexistent');
    t('ROLLBACK_NONEXISTENT', false, 'should have thrown');
  } catch(e) {
    t('ROLLBACK_NONEXISTENT', e.message.indexOf('not found') !== -1, e.message);
  }

  // 8. List snapshots
  var ids = await pubSvc.listSnapshots();
  t('LIST_SNAPSHOTS', ids.length >= 2, 'count=' + ids.length);

  // 9. Load snapshot by id
  var loaded = await pubSvc.loadSnapshot(snap.snapshotId);
  t('LOAD_SNAPSHOT', loaded.snapshotId === snap.snapshotId && loaded.frame[0] === 0xAA, '');

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
