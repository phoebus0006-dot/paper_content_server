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

function makeFrame() {
  var b = Buffer.alloc(192010);
  b.write('EPF1', 0, 'ascii'); b.writeUInt16LE(800, 4); b.writeUInt16LE(480, 6); b[8] = 49; b[9] = 1;
  return b;
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
  var frame = makeFrame();
  var snap = snapshotModel.createSnapshot('news:r3-test:1', { mode: 'news', title: 'R3 Integration Test' }, frame, 'news');
  var result = await svc.publish(snap);
  t('PUBLISH_RETURNS_SNAPSHOTID', result.snapshotId === snap.snapshotId, '');
  t('PUBLISH_COMMITTED', result.committed === true, '');
  t('PUBLISH_HISTORY_OK', result.historyStatus === 'OK', result.historyStatus);
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
  var photoFrame = makeFrame();
  var photoSnap = snapshotModel.createSnapshot('photo:r3-test:img', { mode: 'photo', title: 'Sunset' }, photoFrame, 'photo');
  var photoResult = await svc.publish(photoSnap);
  t('PHOTO_PUBLISH_OK', photoResult.snapshotId === photoSnap.snapshotId && photoResult.committed === true && photoResult.historyStatus === 'OK' && photoResult.notificationStatus === 'OK', '');
  var activePhoto = await svc.getActive();
  t('ACTIVE_PHOTO_MODE', activePhoto.mode === 'photo', '');

  // 6. Rollback to first snapshot
  var rbResult = await svc.rollback(snap.snapshotId);
  t('ROLLBACK_RETURNS_SNAPSHOTID', rbResult.snapshotId === snap.snapshotId, '');
  t('ROLLBACK_COMMITTED', rbResult.committed === true, '');
  t('ROLLBACK_HISTORY_OK', rbResult.historyStatus === 'OK', rbResult.historyStatus);
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
  var notifSnap = snapshotModel.createSnapshot('news:notif-test', { mode: 'news' }, makeFrame(), 'news');
  var notifResult = await notifServices.svc.publish(notifSnap);
  t('NOTIF_FAIL_STILL_PUBLISHES', notifResult.snapshotId === notifSnap.snapshotId && notifResult.committed === true, '');
  t('NOTIF_FAIL_STATUS', notifResult.notificationStatus === 'FAILED', notifResult.notificationStatus);
  t('NOTIF_FAIL_HISTORY_OK', notifResult.historyStatus === 'OK', notifResult.historyStatus);
  var activeNotif = await notifServices.svc.getActive();
  t('NOTIF_FAIL_ACTIVE_SWITCHED', activeNotif.snapshotId === notifSnap.snapshotId, '');

  // 11. stateCallback failure rolls back transaction — active pointer, mode, override unchanged
  var cbDir = path.join(os.tmpdir(), 'r3_cb_test_' + Date.now());
  fs.mkdirSync(cbDir, { recursive: true });
  var cbStore = SnapshotStore(path.join(cbDir, 'snap'), path.join(cbDir, 'pub'), logger);
  await cbStore.ensureDirs();
  var cbCache = SnapshotCache();
  var cbHist = PublicationHistory(path.join(cbDir, 'hist.json'), logger);
  var cbMode = { _mode: 'AUTO', getMode: function() { return this._mode; }, setMode: function(m) { this._mode = m; } };
  var cbOverride = { _override: null, loadOverride: function() { return this._override; }, saveOverride: function(o) { this._override = o; }, clearOverride: function() { this._override = null; } };
  var cbSvc = PublicationService(cbStore, cbCache, PinStore(), PublicationLock(), { notify: function() { return Promise.resolve(); }, name: 'cb' }, cbMode, cbHist, logger, cbOverride);
  // Publish initial snapshot to set a baseline
  var initFrame = makeFrame();
  var initSnap = snapshotModel.createSnapshot('news:cb-baseline', { mode: 'news' }, initFrame, 'news');
  await cbSvc.publish(initSnap);
  var priorActiveId = initSnap.snapshotId;
  var priorMode = cbMode.getMode();
  cbMode.setMode('AUTO');
  var cbFrame = makeFrame();
  var cbSnap = snapshotModel.createSnapshot('news:cb-fail', { mode: 'news' }, cbFrame, 'news');
  try {
    await cbSvc.publish(cbSnap, {
      stateCallback: function(ctx) {
        throw new Error('simulated state callback failure');
      }
    });
    t('CB_FAIL_SHOULD_REJECT', false, 'publish should have rejected');
  } catch(e) {
    t('CB_FAIL_REJECTS', e.message.indexOf('simulated state callback failure') >= 0, e.message);
  }
  var cbActive = await cbStore.readActive();
  t('CB_FAIL_ACTIVE_UNCHANGED', cbActive && cbActive.activeSnapshotId === priorActiveId, (cbActive ? cbActive.activeSnapshotId : 'null') + ' vs ' + priorActiveId);
  t('CB_FAIL_MODE_UNCHANGED', cbMode._mode === priorMode, cbMode._mode + ' vs ' + priorMode);
  t('CB_FAIL_OVERRIDE_NULL', cbOverride._override === null, String(cbOverride._override));
  var cbHistory = await cbHist.list();
  t('CB_FAIL_NO_HISTORY_ENTRY', cbHistory.length === 1, 'expected 1 (baseline only), got ' + cbHistory.length);
  try { fs.rmdirSync(cbDir, { recursive: true }); } catch(e) {}

  // 12. overridePersistence.saveOverride throws inside stateCallback — rolls back
  var cb2Dir = path.join(os.tmpdir(), 'r3_cb2_test_' + Date.now());
  fs.mkdirSync(cb2Dir, { recursive: true });
  var cb2Store = SnapshotStore(path.join(cb2Dir, 'snap'), path.join(cb2Dir, 'pub'), logger);
  await cb2Store.ensureDirs();
  var cb2Cache = SnapshotCache();
  var cb2Hist = PublicationHistory(path.join(cb2Dir, 'hist.json'), logger);
  var cb2Mode = { _mode: 'AUTO', getMode: function() { return this._mode; }, setMode: function(m) { this._mode = m; } };
  var cb2Override = { _override: null, loadOverride: function() { return this._override; }, saveOverride: function(o) { throw new Error('override persist failed'); }, clearOverride: function() { this._override = null; } };
  var cb2Svc = PublicationService(cb2Store, cb2Cache, PinStore(), PublicationLock(), { notify: function() { return Promise.resolve(); }, name: 'cb2' }, cb2Mode, cb2Hist, logger, cb2Override);
  // Publish baseline
  var init2Frame = makeFrame();
  var init2Snap = snapshotModel.createSnapshot('news:cb2-baseline', { mode: 'news' }, init2Frame, 'news');
  await cb2Svc.publish(init2Snap);
  // Mode is AUTO after baseline publish
  var prior2ActiveId = init2Snap.snapshotId;
  var cb2Frame = makeFrame();
  var cb2Snap = snapshotModel.createSnapshot('news:cb2-fail', { mode: 'news' }, cb2Frame, 'news');
  try {
    await cb2Svc.publish(cb2Snap, {
      stateCallback: function(ctx) {
        ctx.operatingModeService.setMode('LEGACY_ADMIN_OVERRIDE');
        ctx.overridePersistence.saveOverride({ mode: 'LEGACY_ADMIN_OVERRIDE', snapshotId: ctx.snapshot.snapshotId });
      }
    });
    t('CB2_SAVEOVERRIDE_SHOULD_REJECT', false, 'publish should have rejected');
  } catch(e) {
    t('CB2_SAVEOVERRIDE_REJECTS', e.message.indexOf('override persist failed') >= 0, e.message);
  }
  var cb2Active = await cb2Store.readActive();
  t('CB2_ACTIVE_UNCHANGED', cb2Active && cb2Active.activeSnapshotId === prior2ActiveId, (cb2Active ? cb2Active.activeSnapshotId : 'null') + ' vs ' + prior2ActiveId);
  // Pre-publication mode was AUTO; stateCallback set LEGACY_ADMIN_OVERRIDE then saveOverride threw;
  // rollback must restore mode to pre-publication value (AUTO).
  t('CB2_MODE_ROLLED_BACK', cb2Mode._mode === 'AUTO', cb2Mode._mode);
  var cb2History = await cb2Hist.list();
  t('CB2_NO_HISTORY_ENTRY', cb2History.length === 1, 'expected 1 (baseline only), got ' + cb2History.length);
  try { fs.rmdirSync(cb2Dir, { recursive: true }); } catch(e) {}

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
