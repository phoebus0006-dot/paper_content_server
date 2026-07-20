const fs = require('fs');

class AdminPublishService {
  constructor(runtime, r1Logger) {
    this.runtime = runtime;
    this.logger = r1Logger;
  }

  async publish(snap, targetMode, overrideContext = {}) {
    if (!this.runtime.publicationService || !this.runtime.snapshotStore || !this.runtime.operatingModeService) {
      throw new Error('Required services unavailable for publish');
    }

    if (snap.mode !== 'news' && snap.mode !== 'photo') {
      throw new Error('Invalid snapshot mode: ' + snap.mode);
    }
    
    // Ensure frameId prefix correctly aligns with the content type
    if (snap.mode === 'news' && !snap.frameId.startsWith('news:')) {
      throw new Error('News snapshot frameId must start with news:');
    }
    if (snap.mode === 'photo' && !snap.frameId.startsWith('photo:')) {
      throw new Error('Photo snapshot frameId must start with photo:');
    }

    // Transaction Phase 1, 2, 3: Read Old State
    const oldActive = await this.runtime.publicationService.getActive();
    const oldMode = this.runtime.operatingModeService.getMode();
    let oldOverride = null;
    if (this.runtime.overridePersistence) {
      oldOverride = this.runtime.overridePersistence.loadOverride ? this.runtime.overridePersistence.loadOverride() : null;
    }

    // Transaction Phase 4, 6, 7: Validate frame
    if (!snap.frame || snap.frame.length !== 192010) {
      throw new Error('Invalid frame buffer length. Expected 192010 bytes.');
    }

    // Phase 8: Save to non-active area
    await this.runtime.snapshotStore.save(snap);

    let rollbackNeeded = false;
    let publishError = null;
    let notifStatus = 'OK';
    let histStatus = 'OK';

    try {
      // Phase 9: Atomic save new override
      if (targetMode === 'ONE_SHOT_OVERRIDE') {
         if (this.runtime.overridePersistence) {
           this.runtime.overridePersistence.saveOverride(Object.assign({ mode: 'ONE_SHOT_OVERRIDE', snapshotId: snap.snapshotId }, overrideContext));
         }
      } else {
         if (this.runtime.overridePersistence) {
           this.runtime.overridePersistence.saveOverride(Object.assign({ mode: targetMode, snapshotId: snap.snapshotId, savedAt: new Date().toISOString() }, overrideContext));
         }
      }
      
      // Phase 10: Atomic switch active pointer
      await this.runtime.snapshotStore.activate(snap.snapshotId);
      
      // Phase 11: Set new operating mode
      if (targetMode === 'ONE_SHOT_OVERRIDE') {
         this.runtime.operatingModeService.enterOneShot(snap.snapshotId, overrideContext.expiresAt);
      } else {
         this.runtime.operatingModeService.setMode(targetMode);
      }
      
      this.runtime.lastPublishedAt = new Date().toISOString();

      // Phase 12-15: Read-back Verification
      const active = await this.runtime.publicationService.getActive();
      if (!active || active.snapshotId !== snap.snapshotId || active.frameId !== snap.frameId) {
        throw new Error('Verification failed: active snapshot does not match published snapshot.');
      }
      
      const currentMode = this.runtime.operatingModeService.getMode();
      if (currentMode !== targetMode && currentMode !== 'ONE_SHOT') { 
        // ONE_SHOT_OVERRIDE mode returns 'ONE_SHOT' from getMode() typically. Let's allow 'ONE_SHOT'
        if (targetMode !== 'ONE_SHOT_OVERRIDE' || currentMode !== 'ONE_SHOT') {
          throw new Error('Verification failed: operating mode not persisted correctly.');
        }
      }

      // Check state from stateProvider if available
      if (this.runtime.stateProvider) {
         const state = this.runtime.stateProvider();
         if (state.activeSnapshotId !== snap.snapshotId || state.frameId !== snap.frameId) {
           throw new Error('Verification failed: /api/state.json does not reflect new snapshot.');
         }
      }

      // Verify frame header on disk (14. 重新读取 frame header)
      const framePath = this.runtime.snapshotStore.getFramePath ? this.runtime.snapshotStore.getFramePath(snap.snapshotId) : null;
      if (framePath && fs.existsSync(framePath)) {
         const buf = fs.readFileSync(framePath);
         if (buf.length !== 192010) {
           throw new Error('Verification failed: frame file size is incorrect on disk.');
         }
      }

      // Phase 16: Post-commit logic (History)
      if (this.runtime.publicationHistory) {
         try {
           await this.runtime.publicationHistory.append({
             id: Date.now().toString(36),
             type: snap.mode,
             frameId: snap.frameId,
             snapshotId: snap.snapshotId,
             publishedAt: new Date().toISOString(),
             status: 'active',
           });
         } catch (e) {
           this.logger.error('History append failed: ' + e.message);
           histStatus = 'FAILED';
         }
      }

      // Phase 17: MQTT Notification
      if (this.runtime.notificationPort && typeof this.runtime.notificationPort.notify === 'function') {
         try {
           await this.runtime.notificationPort.notify({
             snapshotId: snap.snapshotId,
             frameId: snap.frameId,
             frameSha256: snap.frameSha256,
             publishedAt: new Date().toISOString(),
             reason: snap.publishReason
           });
         } catch (e) {
           this.logger.warn('Notification failed: ' + e.message);
           notifStatus = 'FAILED';
         }
      }

    } catch (err) {
      rollbackNeeded = true;
      publishError = err;
    }

    // Rollback if any critical step failed
    if (rollbackNeeded) {
      this.logger.error('Publish transaction failed, rolling back. Error: ' + publishError.message);
      try {
        if (oldActive && oldActive.snapshotId) {
           await this.runtime.snapshotStore.activate(oldActive.snapshotId);
        }
        if (oldOverride && this.runtime.overridePersistence) {
           this.runtime.overridePersistence.saveOverride(oldOverride);
        } else if (this.runtime.overridePersistence) {
           this.runtime.overridePersistence.clearOverride();
        }
        if (oldMode) {
           if (oldMode === 'ONE_SHOT_OVERRIDE') {
             this.runtime.operatingModeService.enterOneShot(oldActive.snapshotId, oldOverride ? oldOverride.expiresAt : null);
           } else {
             this.runtime.operatingModeService.setMode(oldMode);
           }
        }
        
        // Clean up temporary files
        if (snap.snapshotId) {
          try {
             // Try to remove the failed snapshot files
             if (this.runtime.snapshotStore.deleteSnapshot) {
                await this.runtime.snapshotStore.deleteSnapshot(snap.snapshotId);
             }
          } catch(e) {}
        }
      } catch (rbErr) {
        this.logger.error('FATAL: Rollback also failed: ' + rbErr.message);
      }
      throw publishError;
    }

    // Phase 18: 返回结果
    if (notifStatus === 'FAILED') {
      return {
        status: 'published_with_warning',
        published: true,
        notification: { ok: false, errorCode: 'MQTT_NOTIFY_FAILED' },
        frameId: snap.frameId,
        snapshotId: snap.snapshotId
      };
    }

    return {
      status: 'published',
      published: true,
      frameId: snap.frameId,
      snapshotId: snap.snapshotId
    };
  }
  
  async restoreAuto() {
    if (!this.runtime.operatingModeService) throw new Error('operatingModeService unavailable');
    
    // Clear modes
    this.runtime.operatingModeService.exitOneShot();
    this.runtime.operatingModeService.exitFocusLock();
    this.runtime.operatingModeService.setMode('AUTO');
    
    if (this.runtime.overridePersistence) {
      this.runtime.overridePersistence.clearOverride();
    }
    
    // The user explicitly requires restoring auto to actively compute the new schedule and generate/activate content.
    if (this.runtime.contentBuilder) {
       try {
           const content = await this.runtime.contentBuilder(this.runtime.nowProvider ? this.runtime.nowProvider() : new Date());
           if (content && content.snapshot && content.frame) {
              const snap = this.runtime.createSnapshot(content.snapshot.frameId, content.snapshot, content.frame, content.snapshot.mode, {
                publishReason: 'restore_auto'
              });
              await this.publish(snap, 'AUTO');
           } else {
              throw new Error('Content builder returned invalid content.');
           }
       } catch (err) {
           throw new Error('Failed to generate or activate auto content: ' + err.message);
       }
    } else {
       throw new Error('contentBuilder unavailable');
    }
    
    return { status: 'auto_restored' };
  }
}

module.exports = { AdminPublishService };
