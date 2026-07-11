#!/usr/bin/env node
// R3.3e: PublicationService — unified publish with notification/history semantics
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
var PublicationHistory = require(path.join(ROOT, 'src', 'publication', 'publication-history')).PublicationHistory;
var PublicationService = require(path.join(ROOT, 'src', 'publication', 'publication-service')).PublicationService;

function makeFrame(size) {
  var buf = Buffer.alloc(size, 0xAA);
  buf.write('EPF1', 0, 'ascii');
  return buf;
}

var tmpDir = path.join(os.tmpdir(), 'r3_pub_test_' + Date.now());
var snapDir = path.join(tmpDir, 'snapshots');
var pubDir = path.join(tmpDir, 'publication');
var histFile = path.join(tmpDir, 'history.json');
var logger = { info: function(){}, warn: function(){}, error: function(){} };

function makeServices() {
  var store = SnapshotStore(snapDir, pubDir, logger);
  var cache = SnapshotCache();
  var pin = PinStore();
  var lock = PublicationLock();
  var notif = { notify: function() { return Promise.resolve(); }, name: 'test' };
  var hist = PublicationHistory(histFile, logger);
  var svc = PublicationService(store, cache, pin, lock, notif, null, hist, logger);
  return { store: store, cache: cache, pin: pin, lock: lock, notif: notif, hist: hist, svc: svc };
}

var svcData = makeServices();
var store = svcData.store, cache = svcData.cache;
var svc = svcData.svc, hist = svcData.hist;

async function run() {
  // 1. Publish a news snapshot
  var frame = makeFrame(16);
  var snap = snapshotModel.createSnapshot('news:r3-test:1', { mode: 'news', title: 'R3 Integration Test' }, frame, 'news');
  var result = await svc.publish(snap);
  t('PUBLISH_RETURNS_SNAPSHOTID', result.snapshotId === snap.snapshotId, '');
  t('PUBLISH_NOTIFICATION_OK', result.notificationStatus === 'OK', result.notificationStatus);

  // 2. Get active snapshot
  var active = await svc.getActive();
  t('ACTIVE_EXISTS', active !== null, '');
  t('ACTIVE_SNAPSHOTID', active.snapshotId === snap.snapshotId, '');
  t('ACTIVE_FRAME_SHA256', active.frameSha256 === snap.frameSha256, '');
  t('ACTIVE_FROZEN', Object.isFrozen(active), '');

  // 3. Active is served from cache
  var active2 = await svc.getActive();
  t('ACTIVE_CACHED', active2 === active, 'same ref');

  // 4. History has publish entry
  var entries = await hist.list();
  t('HISTORY_HAS_ENTRY', entries.length === 1 && entries[0].snapshotId === snap.snapshotId && entries[0].type === 'news', '');

  // 5. Publish a photo snapshot
  var photoFrame = makeFrame(32);
  var photoSnap = snapshotModel.createSnapshot('photo:r3-test:img', { mode: 'photo', title: 'Sunset' }, photoFrame, 'photo');
  var photoResult = await svc.publish(photoSnap);
  t('PHOTO_PUBLISH_OK', photoResult.snapshotId === photoSnap.snapshotId && photoResult.notificationStatus === 'OK', '');
  var activePhoto = await svc.getActive();
  t('ACTIVE_PHOTO_MODE', activePhoto.mode === 'photo', '');

  // 6. Rollback to first snapshot
  var rbId = await svc.rollback(snap.snapshotId);
  t('ROLLBACK_RETURNS_ID', rbId === snap.snapshotId, '');
  var activeRb = await svc.getActive();
  t('ROLLBACK_ACTIVE_FRAME_SHA', activeRb.frameSha256 === snap.frameSha256, '');

  // 7. Rollback to non-existent
  try {
    await svc.rollback('nonexistent');
    t('ROLLBACK_NONEXISTENT', false, 'should have thrown');
  } catch(e) {
    t('ROLLBACK_NONEXISTENT_THROWS', true, e.message);
  }

  // 8. List snapshots
  var ids = await svc.listSnapshots();
  t('LIST_SNAPSHOTS', ids.length >= 2, 'count=' + ids.length);

  // 9. Load snapshot by id
  var loaded = await svc.loadSnapshot(snap.snapshotId);
  t('LOAD_SNAPSHOT', loaded.snapshotId === snap.snapshotId, '');

  // 10. Notification failure does not reject publish
  var notifServices = makeServices();
  notifServices.notif.notify = function() { return Promise.reject(new Error('notif fail')); };
  var notifSnap = snapshotModel.createSnapshot('news:notif-test', { mode: 'news' }, makeFrame(16), 'news');
  var notifResult = await notifServices.svc.publish(notifSnap);
  t('NOTIF_FAIL_STILL_PUBLISHES', notifResult.snapshotId === notifSnap.snapshotId, '');
  t('NOTIF_FAIL_STATUS', notifResult.notificationStatus === 'FAILED', notifResult.notificationStatus);
  var activeNotif = await notifServices.svc.getActive();
  t('NOTIF_FAIL_ACTIVE_SWITCHED', activeNotif.snapshotId === notifSnap.snapshotId, '');

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
