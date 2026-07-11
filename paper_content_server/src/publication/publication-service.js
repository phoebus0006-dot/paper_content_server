// publication-service.js — Unified publish command handler
// Order: save → activate → cache → history append → notification
// Notification failure: publication remains successful, returns notificationStatus
// History failure after activation: logged, active snapshot unchanged

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
    var notifStatus = 'OK';
    return snapshotStore.save(snapshot).then(function() {
      return snapshotStore.activate(snapshot.snapshotId);
    }).then(function() {
      snapshotCache.set(snapshot.snapshotId, snapshot);
      return history.append({
        id: Date.now().toString(36),
        type: snapshot.mode,
        frameId: snapshot.frameId,
        snapshotId: snapshot.snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      });
    }).then(function() {
      // Notification after history; failure does not reject publish
      return notificationPort.notify(snapshot.snapshotId).catch(function(err) {
        logger.warn('notification failed for ' + snapshot.snapshotId + ': ' + err.message);
        notifStatus = 'FAILED';
      });
    }).then(function() {
      logger.info('Published: ' + snapshot.snapshotId + ' (frameId=' + snapshot.frameId + ')');
      return { snapshotId: snapshot.snapshotId, notificationStatus: notifStatus };
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
    var loaded;
    return snapshotStore.load(snapshotId).then(function(snap) {
      if (!snap) throw new Error('Snapshot not found: ' + snapshotId);
      loaded = snap;
      return snapshotStore.activate(snapshotId);
    }).then(function() {
      snapshotCache.set(snapshotId, loaded);
      return history.append({
        id: Date.now().toString(36),
        type: 'rollback',
        frameId: loaded.frameId,
        snapshotId: snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      });
    }).then(function() {
      logger.info('Rollback to: ' + snapshotId + ' (frameSha=' + loaded.frameSha256.slice(0, 8) + ')');
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
