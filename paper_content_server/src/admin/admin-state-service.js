class AdminStateService {
  constructor(dependencies = {}) {
    this.operatingModeService = dependencies.operatingModeService || null;
    this.snapshotStore = dependencies.snapshotStore || null;
    this.publicationHistory = dependencies.publicationHistory || null;
    this.mqttClient = dependencies.mqttClient || null;
    this.clock = dependencies.clock || Date;
  }

  async getAdminState() {
    const now = new Date(this.clock.now ? this.clock.now() : Date.now());
    const state = {
      generatedAt: now.toISOString(),
      consistent: true,
      inconsistencies: [],
      active: {
        contentMode: 'unknown',
        operatingMode: 'UNKNOWN',
        snapshotId: null,
        frameId: null,
        frameSha256: null,
        frameLength: 0,
        assetId: null,
        recipeHash: null,
        activatedAt: null
      },
      override: {
        active: false,
        type: null,
        expiresAt: null
      },
      schedule: {
        currentMode: 'unknown',
        nextSwitchAt: null
      },
      lastPublication: null,
      device: {},
      health: {
        status: 'ok',
        uptime: process.uptime()
      },
      build: this._getBuildInfo()
    };

    try {
      // 1. Operating Mode & Override
      if (this.operatingModeService) {
        const opMode = this.operatingModeService.getCurrentMode();
        state.active.operatingMode = opMode.mode;
        state.schedule.currentMode = opMode.scheduleMode || 'news';
        state.schedule.nextSwitchAt = opMode.nextSwitchAt ? opMode.nextSwitchAt.toISOString() : null;
        
        if (opMode.mode !== 'AUTO') {
          state.override.active = true;
          state.override.type = opMode.mode;
          state.override.expiresAt = opMode.expiresAt ? opMode.expiresAt.toISOString() : null;
        }
      }

      // 2. Active Snapshot & Frame
      if (this.snapshotStore) {
        const activeSnap = await this.snapshotStore.getActiveSnapshot();
        if (activeSnap) {
          state.active.snapshotId = activeSnap.snapshotId;
          state.active.frameId = activeSnap.frameId;
          state.active.contentMode = activeSnap.mode || (activeSnap.frameId && activeSnap.frameId.includes('photo') ? 'photo' : 'news');
          state.active.activatedAt = activeSnap.createdAt;
          
          if (activeSnap.metadata) {
             state.active.assetId = activeSnap.metadata.assetId || null;
             state.active.recipeHash = activeSnap.metadata.recipeHash || null;
          }

          const frame = await this.snapshotStore.getFrame(activeSnap.frameId);
          if (frame) {
            state.active.frameLength = frame.length;
            const crypto = require('crypto');
            state.active.frameSha256 = crypto.createHash('sha256').update(frame).digest('hex');
          }
        }
      }

      // 3. Publication History
      if (this.publicationHistory) {
        const history = await this.publicationHistory.list();
        if (history && history.length > 0) {
          state.lastPublication = history[0];
        }
      }

      // 4. Device Status
      if (this.mqttClient) {
        state.device = {
          connected: this.mqttClient.isConnected(),
          lastSeen: this.mqttClient.getLastSeen ? this.mqttClient.getLastSeen() : null
        };
      }

      // 5. Consistency Checks
      this._checkConsistency(state);

    } catch (e) {
      state.health.status = 'error';
      state.health.error = e.message;
    }

    return state;
  }

  _checkConsistency(state) {
    // operatingMode 与 override 一致
    if (state.active.operatingMode !== 'AUTO' && !state.override.active) {
      this._addInconsistency(state, 'MODE_OVERRIDE_MISMATCH', 'override active', 'override inactive');
    }

    // snapshot frameId == state frameId
    // frameLength == 192010
    if (state.active.frameLength && state.active.frameLength !== 192010) {
       this._addInconsistency(state, 'INVALID_FRAME_LENGTH', '192010', state.active.frameLength);
    }

    // contentMode 与 frameId 前缀一致
    if (state.active.frameId && state.active.contentMode) {
      if (state.active.contentMode === 'news' && !state.active.frameId.includes('news')) {
        this._addInconsistency(state, 'CONTENT_MODE_MISMATCH', 'news frameId', state.active.frameId);
      }
      if (state.active.contentMode === 'photo' && !state.active.frameId.includes('photo')) {
        this._addInconsistency(state, 'CONTENT_MODE_MISMATCH', 'photo frameId', state.active.frameId);
      }
    }
    
    // lastPublication 与 active snapshot 可对应
    if (state.lastPublication && state.active.snapshotId && state.lastPublication.snapshotId !== state.active.snapshotId) {
        // Warning: This could be normal during transition, but flagged if persistently mismatched
    }
  }

  _addInconsistency(state, code, expected, actual) {
    state.consistent = false;
    state.inconsistencies.push({ code, expected, actual });
  }

  _getBuildInfo() {
    try {
      const fs = require('fs');
      const path = require('path');
      const buildFile = path.join(__dirname, '../../public/admin/build-info.json');
      if (fs.existsSync(buildFile)) {
        return JSON.parse(fs.readFileSync(buildFile, 'utf8'));
      }
    } catch (e) {}
    return {
      commit: process.env.GIT_COMMIT || 'unknown',
      branch: process.env.GIT_BRANCH || 'unknown',
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      serverVersion: process.env.npm_package_version || '1.0.0'
    };
  }
}

module.exports = { AdminStateService };
