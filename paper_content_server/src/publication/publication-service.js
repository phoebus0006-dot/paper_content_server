// publication-service.js — Unified publish command handler
// Order: save → activate → cache → history append → notification
// save/activate failure: reject, active snapshot unchanged
// history/notification failure after activation: committed=true, status fields set
// Returns { snapshotId, committed, historyStatus, notificationStatus }

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
    var histStatus = 'OK', notifStatus = 'OK';
    return snapshotStore.save(snapshot).then(function() {
      return snapshotStore.activate(snapshot.snapshotId);
    }).then(function() {
      snapshotCache.set(snapshot.snapshotId, snapshot);
    }).then(function() {
      // History failure is isolated: does not reject publish, does not undo activation
      return history.append({
        id: Date.now().toString(36),
        type: snapshot.mode,
        frameId: snapshot.frameId,
        snapshotId: snapshot.snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      }).catch(function(err) {
        logger.error('history append failed after activation for ' + snapshot.snapshotId + ': ' + (err.message || err));
        histStatus = 'FAILED';
      });
    }).then(function() {
      return notificationPort.notify({snapshotId:snapshot.snapshotId,frameId:snapshot.frameId,frameSha256:snapshot.frameSha256,publishedAt:new Date().toISOString(),reason:snapshot.publishReason}).catch(function(err) {
        logger.warn('notification failed for ' + snapshot.snapshotId + ': ' + err.message);
        notifStatus = 'FAILED';
      });
    }).then(function() {
      logger.info('Published: ' + snapshot.snapshotId + ' (frameId=' + snapshot.frameId + ', hist=' + histStatus + ', notif=' + notifStatus + ')');
      return { snapshotId: snapshot.snapshotId, committed: true, historyStatus: histStatus, notificationStatus: notifStatus };
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
    var loaded, histStatus = 'OK';
    return history.list().then(function(entries) {
      var entry = entries.filter(function(e) { return e.snapshotId === snapshotId; })[0];
      if (entry && entry.restorable === false) {
        throw new Error('Snapshot is not restorable: ' + snapshotId + ' reason=' + (entry.invalidReason || 'unknown'));
      }
    }).then(function() {
      return snapshotStore.load(snapshotId);
    }).then(function(snap) {
      if (!snap) throw new Error('Snapshot not found: ' + snapshotId);
      loaded = snap;
      return snapshotStore.activate(snapshotId);
    }).then(function() {
      snapshotCache.set(snapshotId, loaded);
      // History append failure is isolated — does not undo activation
      return history.append({
        id: Date.now().toString(36),
        type: 'rollback',
        frameId: loaded.frameId,
        snapshotId: snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      }).catch(function(err) {
        logger.error('history append failed after rollback activation for ' + snapshotId + ': ' + (err.message || err));
        histStatus = 'FAILED';
      });
    }).then(function() {
      logger.info('Rollback to: ' + snapshotId + ' (frameSha=' + loaded.frameSha256.slice(0, 8) + ', hist=' + histStatus + ')');
      return { snapshotId: snapshotId, committed: true, historyStatus: histStatus };
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
