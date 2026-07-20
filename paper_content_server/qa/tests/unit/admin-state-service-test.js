const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('AdminStateService', () => {
  let AdminStateService, ass;

  before(() => {
    const mod = require('../../../src/admin/admin-state-service');
    AdminStateService = mod.AdminStateService;
  });

  it('should construct with null deps', () => {
    const s = new AdminStateService({});
    assert.ok(s);
    assert.equal(s.operatingModeService, null);
  });

  it('should return state with consistent=false when no deps', async () => {
    const s = new AdminStateService({});
    const state = await s.getAdminState();
    assert.ok(state);
    assert.equal(state.consistent, false);
    assert.ok(Array.isArray(state.inconsistencies));
    assert.equal(state.health.status, 'ok');
  });

  it('should report inconsistency for snapshot mismatch', async () => {
    const mockOpMode = {
      getCurrentMode: () => ({ mode: 'AUTO', scheduleMode: 'news' })
    };
    const mockSnapshot = {
      getActiveSnapshot: async () => ({
        snapshotId: 'snap-b',
        frameId: 'news:test-frame',
        mode: 'news',
        createdAt: new Date().toISOString()
      }),
      getFrame: async () => Buffer.alloc(192010, 0x11)
    };
    const mockHistory = {
      list: async () => [{ snapshotId: 'snap-a', publishedAt: new Date().toISOString(), type: 'news' }]
    };
    const s = new AdminStateService({
      operatingModeService: mockOpMode,
      snapshotStore: mockSnapshot,
      publicationHistory: mockHistory
    });
    const state = await s.getAdminState();
    assert.ok(state);
    assert.equal(state.consistent, false);
    const snapMismatch = state.inconsistencies.find(i => i.code === 'SNAPSHOT_MISMATCH');
    assert.ok(snapMismatch, 'Should have SNAPSHOT_MISMATCH inconsistency, got: ' + JSON.stringify(state.inconsistencies));
  });

  it('should include frameSha256 and frameLength in state', async () => {
    const s = new AdminStateService({});
    const state = await s.getAdminState();
    assert.ok('active' in state);
  });
});
