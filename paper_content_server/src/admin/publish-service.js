// publish-service.js
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
    
    // Ensure frameId prefix correctly aligns with the content type, not schedule
    if (snap.mode === 'news' && !snap.frameId.startsWith('news:')) {
      throw new Error('News snapshot frameId must start with news:');
    }
    if (snap.mode === 'photo' && !snap.frameId.startsWith('photo:')) {
      throw new Error('Photo snapshot frameId must start with photo:');
    }

    // Call the underlying atomic publication service (handles save, activate, history, mqtt)
    const pubResult = await this.runtime.publicationService.publish(snap);
    
    // Persist mode
    this.runtime.operatingModeService.setMode(targetMode);
    
    if (targetMode === 'ONE_SHOT_OVERRIDE') {
       this.runtime.operatingModeService.enterOneShot(snap.snapshotId, overrideContext.expiresAt);
       if (this.runtime.overridePersistence) {
         this.runtime.overridePersistence.saveOverride(Object.assign({ mode: 'ONE_SHOT_OVERRIDE', snapshotId: snap.snapshotId }, overrideContext));
       }
    } else {
       if (this.runtime.overridePersistence) {
         this.runtime.overridePersistence.saveOverride(Object.assign({ mode: targetMode, snapshotId: snap.snapshotId, savedAt: new Date().toISOString() }, overrideContext));
       }
    }
    
    this.runtime.lastPublishedAt = new Date().toISOString();

    // Read back verification
    const active = await this.runtime.publicationService.getActive();
    if (!active || active.snapshotId !== snap.snapshotId || active.frameId !== snap.frameId) {
      // The active pointer didn't switch correctly or was immediately overwritten
      throw new Error('Verification failed: active snapshot does not match published snapshot.');
    }
    
    // Check mode
    if (this.runtime.operatingModeService.getMode() !== targetMode) {
      throw new Error('Verification failed: operating mode not persisted correctly.');
    }

    // Verify MQTT notification
    if (pubResult.notificationStatus === 'FAILED') {
      return {
        status: 'published_with_warning',
        published: true,
        notification: {
          ok: false,
          errorCode: 'MQTT_NOTIFY_FAILED'
        },
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
    
    // The next schedule tick or state fetch will pick up AUTO.
    // To be synchronous, we can just let ensureActiveSnapshotForSchedule do its job on next state check.
    return { status: 'auto_restored' };
  }
}

module.exports = { AdminPublishService };
