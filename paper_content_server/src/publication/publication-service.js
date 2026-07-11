// publication-service.js — Unified publish command handler
// Orchestrates save → activate → cache → notify → history in a single
// serialized operation.

var path = require('path');

var LOCK_KEY_PUBLISH = 'publish';

function PublicationService(snapshotStore, snapshotCache, pinStore, lock, notificationPort, operatingModeService, history, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function publish(snapshot) {
    return lock.acquire(LOCK_KEY_PUBLISH).then(function(release) {
      return doPublish(snapshot).then(function(result) {
        release();
        return result;
      }, function(err) {
        release();
        return Promise.reject(err);
      });
    });
  }

  function doPublish(snapshot) {
    var snappedId;
    return snapshotStore.save(snapshot).then(function(id) {
      snappedId = id;
      return snapshotStore.activate(snapshot.snapshotId);
    }).then(function() {
      snapshotCache.set(snapshot.snapshotId, snapshot);
      return notificationPort.notify(snapshot.snapshotId);
    }).then(function() {
      return history.append({
        id: Date.now().toString(36),
        type: snapshot.mode,
        frameId: snapshot.frameId,
        snapshotId: snapshot.snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      });
    }).then(function() {
      logger.info('Published: ' + snapshot.snapshotId + ' (frameId=' + snapshot.frameId + ')');
      return snapshot.snapshotId;
    });
  }

  function getActive() {
    return snapshotStore.readActive().then(function(active) {
      if (!active) return null;
      var cached = snapshotCache.get(active.activeSnapshotId);
      if (cached) return cached;
      return snapshotStore.load(active.activeSnapshotId);
    });
  }

  function rollback(snapshotId) {
    return lock.acquire(LOCK_KEY_PUBLISH).then(function(release) {
      return doRollback(snapshotId).then(function(result) {
        release();
        return result;
      }, function(err) {
        release();
        return Promise.reject(err);
      });
    });
  }

  function doRollback(snapshotId) {
    return snapshotStore.load(snapshotId).then(function(snapshot) {
      if (!snapshot) throw new Error('Snapshot not found: ' + snapshotId);
      return snapshotStore.activate(snapshotId);
    }).then(function() {
      return snapshotStore.load(snapshotId);
    }).then(function(snapshot) {
      snapshotCache.set(snapshotId, snapshot);
      return history.append({
        id: Date.now().toString(36),
        type: 'rollback',
        frameId: snapshot.frameId,
        snapshotId: snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      });
    }).then(function() {
      logger.info('Rollback to: ' + snapshotId);
      return snapshotId;
    });
  }

  function listSnapshots() {
    return snapshotStore.listSnapshots();
  }

  function loadSnapshot(snapshotId) {
    var cached = snapshotCache.get(snapshotId);
    if (cached) return Promise.resolve(cached);
    return snapshotStore.load(snapshotId);
  }

  return {
    publish: publish,
    getActive: getActive,
    rollback: rollback,
    listSnapshots: listSnapshots,
    loadSnapshot: loadSnapshot,
  };
}

module.exports = { PublicationService: PublicationService };
