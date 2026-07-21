const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { PublicationService } = require(path.join(ROOT, 'src', 'publication', 'publication-service'));

function makeFrame() {
  var b = Buffer.alloc(192010);
  b.write('EPF1', 0, 'ascii'); b.writeUInt16LE(800, 4); b.writeUInt16LE(480, 6); b[8] = 49; b[9] = 1;
  return b;
}

function makeSnapshot(frameId, mode) {
  var { createSnapshot } = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));
  return createSnapshot(frameId || 'news:test:1', { mode: mode || 'news' }, makeFrame(), mode || 'news');
}

// ── Mock factories ──

function mockLock() {
  var release = function() {};
  return { acquire: function() { return Promise.resolve(release); } };
}

function mockNotificationPort(fail) {
  return {
    notify: fail
      ? function() { return Promise.reject(new Error('notif fail')); }
      : function() { return Promise.resolve(); }
  };
}

function mockOperatingModeService(initialMode) {
  var mode = initialMode || 'AUTO';
  return {
    getMode: function() { return mode; },
    setMode: function(m) { mode = m; },
  };
}

function mockHistory(failOnAppend, entries) {
  var data = entries || [];
  return {
    list: function() { return Promise.resolve(data); },
    append: failOnAppend
      ? function() { return Promise.reject(new Error('history fail')); }
      : function(e) { data.unshift(e); return Promise.resolve(); },
  };
}

function mockOverridePersistence(initialOverride) {
  var override = initialOverride || null;
  return {
    loadOverride: function() { return override; },
    saveOverride: function(o) { override = o; },
    clearOverride: function() { override = null; },
  };
}

function mockSnapshotCache(initial) {
  var map = new Map();
  if (initial) { initial.forEach(function(e) { map.set(e.key, e.value); }); }
  return {
    get: function(k) { return map.get(k) || null; },
    set: function(k, v) { map.set(k, v); },
    delete: function(k) { map.delete(k); },
    clear: function() { map.clear(); },
    size: function() { return map.size; },
    keys: function() { return Array.from(map.keys()); },
    has: function(k) { return map.has(k); },
  };
}

function mockFrameCache(initial) {
  var map = new Map();
  if (initial) { initial.forEach(function(e) { map.set(e.key, e.value); }); }
  return {
    get: function(k) { return map.get(k); },
    set: function(k, v) { map.set(k, v); },
    clear: function() { map.clear(); },
    keys: function() { return map.keys(); },
  };
}

function mockSnapshotStore(failOnSave, failOnActivate, failOnReadActive) {
  var store = {};
  var activeId = null;
  return {
    save: failOnSave
      ? function() { return Promise.reject(new Error('save fail')); }
      : function(snap) { store[snap.snapshotId] = snap; return Promise.resolve(snap.snapshotId); },
    load: function(id) { return store[id] ? Promise.resolve(store[id]) : Promise.reject(new Error('not found: ' + id)); },
    activate: failOnActivate
      ? function() { return Promise.reject(new Error('activate fail')); }
      : function(id) { activeId = id; return Promise.resolve(); },
    readActive: failOnReadActive
      ? function() { return Promise.reject(new Error('readActive fail')); }
      : function() { return activeId ? Promise.resolve({ activeSnapshotId: activeId, frameSha256: store[activeId] ? store[activeId].frameSha256 : null, frameLength: 192010 }) : Promise.resolve(null); },
    listSnapshots: function() { return Promise.resolve(Object.keys(store)); },
    ensureDirs: function() { return Promise.resolve(); },
  };
}

var logger = { info: function() {}, warn: function() {}, error: function() {} };

describe('PublicationService transaction — fault injection', () => {

  it('should rollback when snapshotStore.save fails', async () => {
    var store = mockSnapshotStore(true, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence();
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:save-fail', 'news');

    // Initial state: nothing active, mode AUTO
    assert.equal(opMode.getMode(), 'AUTO');
    assert.equal(op.loadOverride(), null);

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('save fail'), 'throws save fail error');
    }

    // Rollback should have restored: no active snapshot, mode still AUTO
    var active = await store.readActive();
    assert.equal(active, null, 'no active snapshot after rollback');
    assert.equal(opMode.getMode(), 'AUTO', 'mode restored to AUTO');
    assert.equal(op.loadOverride(), null, 'override unchanged');
    var entries = await hist.list();
    assert.equal(entries.length, 0, 'history unchanged');
  });

  it('should rollback when snapshotStore.activate fails', async () => {
    var store = mockSnapshotStore(false, true, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('ONE_SHOT_OVERRIDE');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence({ mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1' });
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:activate-fail', 'news');

    // Pre-state: mode ONE_SHOT_OVERRIDE, override exists
    assert.equal(opMode.getMode(), 'ONE_SHOT_OVERRIDE');
    assert.deepEqual(op.loadOverride(), { mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1' });

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('activate fail'), 'throws activate fail error');
    }

    // Rollback: mode should be restored
    assert.equal(opMode.getMode(), 'ONE_SHOT_OVERRIDE', 'mode restored');
    assert.deepEqual(op.loadOverride(), { mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1' }, 'override restored');
  });

  it('should rollback when read-back detects pointer mismatch', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('FOCUS_LOCK');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence({ mode: 'FOCUS_LOCK', assetId: 'a2' });
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:readback-fail', 'news');

    // Corrupt readActive to return wrong snapshotId
    var origReadActive = store.readActive;
    var callCount = 0;
    store.readActive = function() {
      callCount++;
      // First call (in _savePrePublicationState) returns null
      // Second call (read-back) returns wrong ID
      if (callCount <= 1) return Promise.resolve(null);
      return Promise.resolve({ activeSnapshotId: 'wrong-snapshot-id', frameSha256: 'fake' });
    };

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('READ-BACK FAILED'), 'throws read-back error: ' + e.message);
    }

    // Rollback: mode should be restored
    assert.equal(opMode.getMode(), 'FOCUS_LOCK', 'mode restored after read-back failure');
    assert.deepEqual(op.loadOverride(), { mode: 'FOCUS_LOCK', assetId: 'a2' }, 'override restored');
  });

  it('should rollback when read-back detects SHA mismatch', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('LEGACY_ADMIN_OVERRIDE');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence({ mode: 'LEGACY_ADMIN_OVERRIDE', assetId: 'old' });
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:sha-fail', 'news');

    // Corrupt the frame after snapshot creation to cause SHA mismatch
    snap.frame[0] = 0xFF;

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('SHA256 mismatch'), 'throws SHA mismatch error: ' + e.message);
    }

    assert.equal(opMode.getMode(), 'LEGACY_ADMIN_OVERRIDE', 'mode restored');
  });

  it('should preserve operating mode after rollback', async () => {
    var store = mockSnapshotStore(true, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('ONE_SHOT_OVERRIDE');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence({ mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1', snapshotId: 'snap_old' });
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:prez-mode', 'news');

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('save fail'));
    }

    // Mode must still be ONE_SHOT_OVERRIDE after rollback
    assert.equal(opMode.getMode(), 'ONE_SHOT_OVERRIDE', 'operating mode preserved');
    assert.deepEqual(op.loadOverride(), { mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1', snapshotId: 'snap_old' }, 'override preserved');
  });

  it('should preserve override after rollback', async () => {
    var store = mockSnapshotStore(false, true, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('FOCUS_LOCK');
    var origOverride = { mode: 'FOCUS_LOCK', assetId: 'a3', libraryType: 'custom' };
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence(origOverride);
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:prez-override', 'news');

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('activate fail'));
    }

    var loadedOp = op.loadOverride();
    assert.deepEqual(loadedOp, origOverride, 'override preserved after rollback');
  });

  it('should preserve snapshot cache after rollback', async () => {
    var cachedSnap = makeSnapshot('news:cached-entry', 'news');
    var cache = mockSnapshotCache([{ key: cachedSnap.snapshotId, value: cachedSnap }]);
    var store = mockSnapshotStore(true, false, false);
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence();
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:cached-test', 'news');

    // Verify cache has the entry before publish
    assert.ok(cache.has(cachedSnap.snapshotId), 'cache has pre-existing entry');
    assert.equal(cache.size(), 1);

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('save fail'));
    }

    // Cache should still have the original entry (rollback restored it)
    assert.ok(cache.has(cachedSnap.snapshotId), 'cache entry preserved after rollback');
    assert.equal(cache.get(cachedSnap.snapshotId).snapshotId, cachedSnap.snapshotId, 'cached snapshot intact');
    // The new snapshot should NOT be in the cache
    assert.equal(cache.has(snap.snapshotId), false, 'failed snapshot not in cache');
  });

  it('should preserve frame cache after rollback', async () => {
    var fc = mockFrameCache([{ key: 'existing-frame', value: Buffer.from('old-data') }]);
    var store = mockSnapshotStore(false, true, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(false, []);
    var op = mockOverridePersistence();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:fc-test', 'news');

    assert.equal(Array.from(fc.keys()).length, 1, 'frame cache has pre-existing entry');

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('activate fail'));
    }

    // Frame cache should still have the original entry
    assert.equal(Array.from(fc.keys()).length, 1, 'frame cache preserved after rollback');
    assert.deepEqual(fc.get('existing-frame'), Buffer.from('old-data'), 'frame cache data intact');
  });

  it('should return committed:true, historyFailed:true when history fails after commit', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(true, []);
    var op = mockOverridePersistence();
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:hist-fail', 'news');

    var result = await svc.publish(snap);

    // Snapshot should be committed despite history failure
    assert.equal(result.committed, true, 'committed despite history failure');
    assert.equal(result.historyFailed, true, 'historyFailed flag set');
    assert.equal(result.historyStatus, 'FAILED', 'historyStatus is FAILED');
    assert.equal(result.notificationStatus, 'OK', 'notification OK');

    // Active snapshot should be the published one
    var active = await store.readActive();
    assert.equal(active.activeSnapshotId, snap.snapshotId, 'active snapshot is the published one');

    // Mode should remain AUTO (not rolled back after commit point)
    assert.equal(opMode.getMode(), 'AUTO', 'mode unchanged after committed publish');
  });

  it('should return committed:true, historyFailed:true when both history and notification fail', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(true, []);
    var notif = mockNotificationPort(true);
    var op = mockOverridePersistence();
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), notif, opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:dual-fail', 'news');

    var result = await svc.publish(snap);

    assert.equal(result.committed, true, 'committed despite dual failure');
    assert.equal(result.historyFailed, true, 'historyFailed flag set');
    assert.equal(result.historyStatus, 'FAILED', 'historyStatus is FAILED');
    assert.equal(result.notificationStatus, 'FAILED', 'notificationStatus is FAILED');

    var active = await store.readActive();
    assert.equal(active.activeSnapshotId, snap.snapshotId, 'active snapshot committed');
  });

  it('should work correctly when no overridePersistence or frameCache are provided', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(false, []);
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger);
    var snap = makeSnapshot('news:no-injections', 'news');

    var result = await svc.publish(snap);
    assert.equal(result.committed, true, 'committed');
    assert.equal(result.historyStatus, 'OK');
    assert.equal(result.notificationStatus, 'OK');

    // setInjections should be callable safely even when deps not provided
    if (typeof svc.setInjections === 'function') {
      svc.setInjections({});
    }
  });

  it('should capture and restore history position (best-effort, no truncation)', async () => {
    var store = mockSnapshotStore(true, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var histEntry = { id: 'old', snapshotId: 'snap_old', publishedAt: '2025-01-01T00:00:00.000Z', status: 'active' };
    var hist = mockHistory(false, [histEntry]);
    var op = mockOverridePersistence();
    var fc = mockFrameCache();
    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);

    try {
      await svc.publish(makeSnapshot('news:hist-pos', 'news'));
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('save fail'));
    }

    // History should still have the original entry
    var entries = await hist.list();
    assert.equal(entries.length, 1, 'history entry preserved');
    assert.equal(entries[0].snapshotId, 'snap_old', 'original history entry intact');
  });

});
