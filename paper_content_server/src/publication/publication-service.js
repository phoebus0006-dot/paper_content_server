// publication-service.js — Unified publish command handler with full transaction support
// Transaction order: save state → save snapshot → activate → read-back → history append → notification
// Pre-commit failure (including history): full rollback via _restorePrePublicationState
// Post-commit (notification only) failure: committed=true, status fields set
// Returns { snapshotId, committed, historyStatus, notificationStatus }

var LOCK_KEY_PUBLISH = 'publish';

function PublicationService(snapshotStore, snapshotCache, pinStore, lock, notificationPort, operatingModeService, history, logger, overridePersistence, frameCache) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };
  overridePersistence = overridePersistence || null;
  frameCache = frameCache || null;

  // ── Late-bound dependency injection ──
  // overridePersistence and frameCache are often created after the service
  // itself; call setInjections() once both are available.
  function setInjections(injections) {
    if (!injections) return;
    if (injections.overridePersistence) overridePersistence = injections.overridePersistence;
    if (injections.frameCache) frameCache = injections.frameCache;
  }

  // ── Pre-publication state snapshot ──
  function _savePrePublicationState() {
    var state = {
      activeSnapshotId: null,
      operatingMode: null,
      override: null,
      lastPublishedAt: null,
      snapshotCacheEntries: [],
      frameCacheEntries: [],
      historyPosition: [],
    };

    return snapshotStore.readActive().then(function(active) {
      state.activeSnapshotId = active ? active.activeSnapshotId : null;
      if (operatingModeService) {
        state.operatingMode = operatingModeService.getMode();
      }
      if (overridePersistence) {
        try { state.override = overridePersistence.loadOverride(); } catch(e) {}
      }
      return history.list();
    }).then(function(entries) {
      state.historyPosition = entries || [];
      if (entries && entries.length > 0) {
        state.lastPublishedAt = entries[0].publishedAt || null;
      }
      // Snapshot cache state
      if (snapshotCache && typeof snapshotCache.keys === 'function') {
        var keys = snapshotCache.keys();
        state.snapshotCacheEntries = keys.map(function(k) {
          return { key: k, value: snapshotCache.get(k) };
        });
      }
      // Frame cache state (Map-like interface with keys()/get())
      if (frameCache && typeof frameCache.keys === 'function') {
        var fKeys = Array.from(frameCache.keys());
        state.frameCacheEntries = fKeys.map(function(k) {
          return { key: k, value: frameCache.get(k) };
        });
      }
      return state;
    });
  }

  // ── Full rollback: restore all captured pre-publication state ──
  function _restorePrePublicationState(state) {
    var chain = Promise.resolve();
    chain = chain.then(function() {
      if (state.activeSnapshotId) {
        return snapshotStore.activate(state.activeSnapshotId).catch(function(err) {
          logger.error('ROLLBACK: failed to restore active pointer ' + state.activeSnapshotId + ': ' + (err.message || err));
        });
      } else {
        return snapshotStore.clearActive().catch(function(err) {
          logger.error('ROLLBACK: failed to clear active pointer: ' + (err.message || err));
        });
      }
    });
    chain = chain.then(function() {
      // Restore operating mode
      if (state.operatingMode !== null && operatingModeService) {
        try { operatingModeService.setMode(state.operatingMode); } catch(e) {
          logger.error('ROLLBACK: failed to restore operating mode ' + state.operatingMode + ': ' + (e.message || e));
        }
      }
      // Restore override persistence
      if (overridePersistence) {
        try {
          if (state.override) {
            overridePersistence.saveOverride(state.override);
          } else {
            overridePersistence.clearOverride();
          }
        } catch(e) {
          logger.error('ROLLBACK: failed to restore override: ' + (e.message || e));
        }
      }
      // Restore snapshot cache to pre-publication state
      if (snapshotCache && typeof snapshotCache.clear === 'function') {
        try { snapshotCache.clear(); } catch(e) {}
        state.snapshotCacheEntries.forEach(function(entry) {
          try { snapshotCache.set(entry.key, entry.value); } catch(e) {}
        });
      }
      // Restore frame cache to pre-publication state
      if (frameCache && typeof frameCache.clear === 'function') {
        try { frameCache.clear(); } catch(e) {}
        state.frameCacheEntries.forEach(function(entry) {
          try { frameCache.set(entry.key, entry.value); } catch(e) {}
        });
      }
      logger.info('ROLLBACK: restored pre-publication state (snapshot=' + state.activeSnapshotId + ', mode=' + state.operatingMode + ')');
    });
    return chain;
  }

  function publish(snapshot, options) {
    return lock.acquire(LOCK_KEY_PUBLISH).then(function(release) {
      return doPublish(snapshot, options).then(function(result) {
        release();
        return result;
      }, function(err) {
        release();
        return Promise.reject(err);
      });
    });
  }

  function doPublish(snapshot, options) {
    var savedState = null;
    var histStatus = 'OK', notifStatus = 'OK';
    var committed = false;

    return _savePrePublicationState().then(function(state) {
      savedState = state;
      return snapshotStore.save(snapshot);
    }).then(function() {
      return snapshotStore.activate(snapshot.snapshotId);
    }).then(function() {
      snapshotCache.set(snapshot.snapshotId, snapshot);
      // Read-back: verify active pointer + frame SHA
      return snapshotStore.readActive();
    }).then(function(active) {
      if (!active || active.activeSnapshotId !== snapshot.snapshotId) {
        throw new Error('READ-BACK FAILED: active snapshot pointer mismatch (expected=' + snapshot.snapshotId + ', got=' + (active ? active.activeSnapshotId : 'null') + ')');
      }
      var crypto = require('crypto');
      var actualSha = crypto.createHash('sha256').update(snapshot.frame).digest('hex');
      if (actualSha !== snapshot.frameSha256) {
        throw new Error('READ-BACK FAILED: frame SHA256 mismatch (expected=' + snapshot.frameSha256 + ', got=' + actualSha + ')');
      }
      logger.info('Read-back verified: snapshotId=' + snapshot.snapshotId + ' frameSha=' + actualSha.slice(0, 8));
    }).then(function() {
      // State callback (pre-commit hook) — runs inside the transaction, before
      // history append. If it throws, the existing rollback mechanism restores
      // pre-publication state (active pointer, mode, override, caches) and the
      // history entry is NOT appended.
      if (options && options.stateCallback) {
        return options.stateCallback({
          snapshot: snapshot,
          savedState: savedState,
          operatingModeService: operatingModeService,
          overridePersistence: overridePersistence,
        });
      }
    }).then(function() {
      // History append (pre-commit: failure triggers full rollback)
      return history.append({
        id: Date.now().toString(36),
        type: snapshot.mode,
        frameId: snapshot.frameId,
        snapshotId: snapshot.snapshotId,
        publishedAt: new Date().toISOString(),
        status: 'active',
      });
    }).then(function() {
      // ── COMMITTED POINT ──
      // Activation + read-back + history succeeded; snapshot is the committed state.
      // Only notification failure is tolerated (committed=true, notificationStatus=FAILED).
      committed = true;
      return notificationPort.notify({snapshotId:snapshot.snapshotId,frameId:snapshot.frameId,frameSha256:snapshot.frameSha256,publishedAt:new Date().toISOString(),reason:snapshot.publishReason}).catch(function(err) {
        logger.warn('notification failed for ' + snapshot.snapshotId + ': ' + err.message);
        notifStatus = 'FAILED';
      });
    }).then(function() {
      logger.info('Published: ' + snapshot.snapshotId + ' (frameId=' + snapshot.frameId + ', hist=' + histStatus + ', notif=' + notifStatus + ')');
      var result = { snapshotId: snapshot.snapshotId, committed: true, historyStatus: histStatus, notificationStatus: notifStatus };
      if (histStatus === 'FAILED') {
        result.historyFailed = true;
      }
      return result;
    }, function(err) {
      // Full rollback only if NOT yet committed
      if (!committed && savedState) {
        logger.warn('Publish failed for ' + snapshot.snapshotId + ', rolling back: ' + (err.message || err));
        return _restorePrePublicationState(savedState).then(function() {
          throw err;
        });
      }
      throw err;
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
    var oldActive = null;
    var activated = false;
    return history.list().then(function(entries) {
      var entry = entries.filter(function(e) { return e.snapshotId === snapshotId; })[0];
      if (entry && entry.restorable === false) {
        throw new Error('Snapshot is not restorable: ' + snapshotId + ' reason=' + (entry.invalidReason || 'unknown'));
      }
    }).then(function() {
      return snapshotStore.readActive();
    }).then(function(active) {
      oldActive = active ? active.activeSnapshotId : null;
      if (oldActive === snapshotId) {
        throw new Error('Already active: ' + snapshotId);
      }
    }).then(function() {
      return snapshotStore.load(snapshotId);
    }).then(function(snap) {
      if (!snap) throw new Error('Snapshot not found: ' + snapshotId);
      loaded = snap;
      return snapshotStore.activate(snapshotId);
    }).then(function() {
      activated = true;
      snapshotCache.set(snapshotId, loaded);
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
    }, function(err) {
      if (activated && oldActive) {
        snapshotStore.activate(oldActive).catch(function(re) {
          logger.error('ROLLBACK RESTORE FAILED: could not restore old active pointer ' + oldActive + ': ' + (re.message || re));
        });
      }
      throw err;
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
    setInjections: setInjections,
  };
}

module.exports = { PublicationService: PublicationService };
