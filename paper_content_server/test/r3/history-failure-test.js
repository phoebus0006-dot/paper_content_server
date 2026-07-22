const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const { PublicationService } = require(path.join(ROOT, 'src', 'publication', 'publication-service'));
const { createSnapshot } = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));
const { SnapshotStore } = require(path.join(ROOT, 'src/snapshot/snapshot-store'));
const { PublicationHistory } = require(path.join(ROOT, 'src/publication/publication-history'));

function makeFrame() {
  var b = Buffer.alloc(192010);
  b.write('EPF1', 0, 'ascii'); b.writeUInt16LE(800, 4); b.writeUInt16LE(480, 6); b[8] = 49; b[9] = 1;
  return b;
}

function makeSnapshot(frameId, mode) {
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
  var cleared = false;
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
      : function() { return activeId ? Promise.resolve({ activeSnapshotId: activeId, frameSha256: store[activeId] ? store[activeId].frameSha256 : null, frameLength: 192010 }) : Promise.resolve(cleared ? { activeSnapshotId: null, frameSha256: null } : null); },
    listSnapshots: function() { return Promise.resolve(Object.keys(store)); },
    ensureDirs: function() { return Promise.resolve(); },
    clearActive: function() { activeId = null; cleared = true; return Promise.resolve(); },
  };
}

var logger = { info: function() {}, warn: function() {}, error: function() {} };

describe('R3 — history failure semantics', () => {

  it('should rollback and reject when history.append fails on publish (no prior active)', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(true, []);
    var op = mockOverridePersistence();
    var fc = mockFrameCache();

    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:no-prior', 'news');

    assert.equal(await store.readActive(), null, 'no prior active snapshot');
    assert.equal(opMode.getMode(), 'AUTO');

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('history fail'), 'throws history fail error');
    }

    // Rollback: must have called clearActive (since there was no prior active)
    var active = await store.readActive();
    assert.notEqual(active, null, 'readActive returns object after clearActive');
    assert.equal(active.activeSnapshotId, null, 'activeSnapshotId cleared');
    assert.equal(opMode.getMode(), 'AUTO', 'mode restored');
    assert.equal(op.loadOverride(), null, 'override unchanged');
    assert.equal(cache.size(), 0, 'snapshot cache empty');
    // History must NOT contain the new entry
    var entries = await hist.list();
    assert.equal(entries.length, 0, 'history unchanged after rollback');
  });

  it('should rollback and reject when history.append fails on publish (with prior active)', async () => {
    var initialSnap = makeSnapshot('news:initial', 'news');
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('ONE_SHOT_OVERRIDE');
    var hist = mockHistory(true, []);
    var op = mockOverridePersistence({ mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1' });
    var fc = mockFrameCache();

    // Pre-populate store with an active snapshot so rollback has a target
    await store.save(initialSnap);
    await store.activate(initialSnap.snapshotId);
    cache.set(initialSnap.snapshotId, initialSnap);

    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:hist-fail', 'news');

    assert.equal(opMode.getMode(), 'ONE_SHOT_OVERRIDE');
    assert.deepEqual(op.loadOverride(), { mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1' });

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('history fail'), 'throws history fail error');
    }

    // State must be fully restored to pre-publication state (committed=false)
    var active = await store.readActive();
    assert.equal(active.activeSnapshotId, initialSnap.snapshotId, 'active snapshot restored to initial');
    assert.equal(opMode.getMode(), 'ONE_SHOT_OVERRIDE', 'mode restored');
    assert.deepEqual(op.loadOverride(), { mode: 'ONE_SHOT_OVERRIDE', assetId: 'a1' }, 'override restored');

    // History must NOT contain the new entry
    var entries = await hist.list();
    assert.equal(entries.length, 0, 'history unchanged after rollback');

    // Cache must NOT contain the new snapshot
    assert.equal(cache.has(snap.snapshotId), false, 'failed snapshot not in cache');
    assert.equal(cache.has(initialSnap.snapshotId), true, 'initial snapshot preserved in cache');
  });

  it('should restore caches when history.append fails on publish', async () => {
    var cachedSnap = makeSnapshot('news:cached-entry', 'news');
    var cache = mockSnapshotCache([{ key: cachedSnap.snapshotId, value: cachedSnap }]);
    var fc = mockFrameCache([{ key: 'existing-frame', value: Buffer.from('old-data') }]);
    var store = mockSnapshotStore(false, false, false);
    var opMode = mockOperatingModeService('AUTO');
    var hist = mockHistory(true, []);
    var op = mockOverridePersistence();

    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snap = makeSnapshot('news:hist-cache', 'news');

    assert.ok(cache.has(cachedSnap.snapshotId), 'pre-existing snapshot cache entry');
    assert.equal(Array.from(fc.keys()).length, 1, 'pre-existing frame cache entry');

    try {
      await svc.publish(snap);
      assert.fail('should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('history fail'));
    }

    // Both caches must be restored to pre-publication state
    assert.ok(cache.has(cachedSnap.snapshotId), 'snapshot cache entry preserved after rollback');
    assert.equal(cache.has(snap.snapshotId), false, 'new snapshot not in cache after rollback');
    assert.equal(Array.from(fc.keys()).length, 1, 'frame cache preserved after rollback');
    assert.deepEqual(fc.get('existing-frame'), Buffer.from('old-data'), 'frame cache data intact');
  });

  it('should rollback successfully when history.append fails during rollback', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('AUTO');
    var op = mockOverridePersistence();
    var fc = mockFrameCache();

    var histData = [];
    var appendCalls = 0;
    var hist = {
      list: function() { return Promise.resolve(histData); },
      append: function(e) {
        appendCalls++;
        if (appendCalls <= 2) {
          histData.unshift(e);
          return Promise.resolve();
        }
        return Promise.reject(new Error('history fail during rollback'));
      }
    };

    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snapA = makeSnapshot('news:rb-a', 'news');
    var snapB = makeSnapshot('news:rb-b', 'news');

    await svc.publish(snapA);
    await svc.publish(snapB);

    var active = await store.readActive();
    assert.equal(active.activeSnapshotId, snapB.snapshotId, 'snapB is active before rollback');

    var errorLogs = [];
    var errLogger = { info: function() {}, warn: function() {}, error: function(m) { errorLogs.push(m); } };
    var svc2 = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, errLogger, op, fc);

    var result;
    try {
      result = await svc2.rollback(snapA.snapshotId);
    } finally {
    }

    // Rollback still succeeds despite history failure
    assert.equal(result.snapshotId, snapA.snapshotId, 'rollback result is snapA');
    assert.equal(result.committed, true, 'rollback committed');
    assert.equal(result.historyStatus, 'FAILED', 'historyStatus is FAILED');

    // Active snapshot pointer is the target (snapA)
    var activeAfter = await store.readActive();
    assert.equal(activeAfter.activeSnapshotId, snapA.snapshotId, 'active snapshot is snapA after rollback');

    // Cache has the target snapshot
    var cachedTarget = cache.get(snapA.snapshotId);
    assert.notEqual(cachedTarget, null, 'snapA is in snapshot cache');
    assert.equal(cachedTarget.snapshotId, snapA.snapshotId, 'cached snapshot matches snapA');

    // Load snapshot to verify data integrity
    var loaded = await store.load(snapA.snapshotId);
    assert.equal(loaded.snapshotId, snapA.snapshotId, 'loaded snapshot is snapA');
    assert.equal(loaded.frameSha256, snapA.frameSha256, 'frame SHA256 matches');

    // History failure was logged
    assert.ok(errorLogs.some(function(m) { return m.indexOf('history append failed') >= 0; }), 'history failure logged');
  });

  it('should rollback successfully when history.append fails during rollback with prior mode/override', async () => {
    var store = mockSnapshotStore(false, false, false);
    var cache = mockSnapshotCache();
    var opMode = mockOperatingModeService('FOCUS_LOCK');
    var op = mockOverridePersistence({ mode: 'FOCUS_LOCK', assetId: 'a3', libraryType: 'custom' });
    var fc = mockFrameCache();

    var histData = [];
    var appendCalls = 0;
    var hist = {
      list: function() { return Promise.resolve(histData); },
      append: function(e) {
        appendCalls++;
        if (appendCalls <= 2) {
          histData.unshift(e);
          return Promise.resolve();
        }
        return Promise.reject(new Error('history fail during rollback'));
      }
    };

    var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
    var snapA = makeSnapshot('news:rb-a-op', 'news');
    var snapB = makeSnapshot('news:rb-b-op', 'news');

    await svc.publish(snapA);
    await svc.publish(snapB);

    var errorLogs = [];
    var errLogger = { info: function() {}, warn: function() {}, error: function(m) { errorLogs.push(m); } };

    var result;
    try {
      var svc2 = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, errLogger, op, fc);
      result = await svc2.rollback(snapA.snapshotId);
    } finally {
    }

    // Mode/override must be preserved (rollback doesn't change these)
    assert.equal(opMode.getMode(), 'FOCUS_LOCK', 'operating mode preserved');
    assert.deepEqual(op.loadOverride(), { mode: 'FOCUS_LOCK', assetId: 'a3', libraryType: 'custom' }, 'override preserved');
    assert.equal(result.snapshotId, snapA.snapshotId, 'rollback result is snapA');
    assert.equal(result.committed, true, 'rollback committed');
    assert.equal(result.historyStatus, 'FAILED', 'historyStatus is FAILED');
  });

  it('should rollback on history.append failure with real SnapshotStore', async () => {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-hist-'));
    try {
      var snapDir = path.join(tmpDir, 'snapshots');
      var pubDir = path.join(tmpDir, 'publication');
      fs.mkdirSync(snapDir, { recursive: true });
      fs.mkdirSync(pubDir, { recursive: true });

      var store = SnapshotStore(snapDir, pubDir, logger);
      var hist = mockHistory(true, []);
      var cache = mockSnapshotCache();
      var fc = mockFrameCache();
      var opMode = mockOperatingModeService('AUTO');
      var op = mockOverridePersistence();

      await store.ensureDirs();

      var svc = PublicationService(store, cache, mockLock(), mockLock(), mockNotificationPort(), opMode, hist, logger, op, fc);
      var snap = makeSnapshot('news:real-store-test', 'news');

      var activeBefore = await store.readActive();
      assert.equal(activeBefore, null);

      try {
        await svc.publish(snap);
        assert.fail('should have thrown');
      } catch(e) {
        assert.ok(e.message.includes('history fail'));
      }

      var activeAfter = await store.readActive();
      assert.notEqual(activeAfter, null, 'readActive returns object');
    assert.equal(activeAfter.activeSnapshotId, null, 'activeSnapshotId cleared');

      var entries = await hist.list();
      assert.equal(entries.length, 0);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
    }
  });

});
