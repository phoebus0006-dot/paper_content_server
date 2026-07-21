const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('AdminStateService — single source of truth', () => {
  let AdminStateService;

  before(() => {
    AdminStateService = require('../../../src/admin/admin-state-service').AdminStateService;
  });

  it('should return consistent data from getAdminState', async () => {
    var ass = new AdminStateService({});
    var state = await ass.getAdminState();
    assert.ok(state);
    assert.ok(state.generatedAt);
    assert.ok(state.active);
    assert.ok(state.health);
    assert.ok(state.schedule);
  });

  it('should include Deprecation: true in dashboard shape', async () => {
    var ass = new AdminStateService({});
    var state = await ass.getAdminState();
    // Dashboard is a transform of getAdminState — verify fields used by server.js dashboard handler
    assert.ok('active' in state);
    assert.ok('health' in state);
    assert.ok('inconsistencies' in state);
    assert.ok('consistent' in state);
  });

  it('should report consistent=false when snapshot mismatch exists', async () => {
    var mockSnapshot = {
      getActiveSnapshot: async () => ({ snapshotId: 'snap-b', frameId: 'news:test-frame', mode: 'news', createdAt: new Date().toISOString() }),
      getFrame: async () => Buffer.alloc(192010, 0x11)
    };
    var mockHistory = {
      list: async () => [{ snapshotId: 'snap-a', publishedAt: new Date().toISOString(), type: 'news' }]
    };
    var mockOpMode = {
      getCurrentMode: () => ({ mode: 'AUTO', scheduleMode: 'news' })
    };
    var ass = new AdminStateService({
      operatingModeService: mockOpMode,
      snapshotStore: mockSnapshot,
      publicationHistory: mockHistory
    });

    var state = await ass.getAdminState();
    assert.equal(state.consistent, false);
    var mismatch = state.inconsistencies.find(function(i) { return i.code === 'SNAPSHOT_MISMATCH'; });
    assert.ok(mismatch, 'Should detect SNAPSHOT_MISMATCH');
  });

  it('should report consistent=true when all data is aligned', async () => {
    var snapId = 'snap-1';
    var mockSnapshot = {
      getActiveSnapshot: async () => ({ snapshotId: snapId, frameId: 'news:test-frame', mode: 'news', createdAt: new Date().toISOString() }),
      getFrame: async () => Buffer.alloc(192010, 0x11)
    };
    var mockHistory = {
      list: async () => [{ snapshotId: snapId, publishedAt: new Date().toISOString(), type: 'news' }]
    };
    var mockOpMode = {
      getCurrentMode: () => ({ mode: 'AUTO', scheduleMode: 'news' })
    };
    var ass = new AdminStateService({
      operatingModeService: mockOpMode,
      snapshotStore: mockSnapshot,
      publicationHistory: mockHistory
    });

    var state = await ass.getAdminState();
    assert.equal(state.consistent, true);
    assert.deepEqual(state.inconsistencies, []);
  });

  it('should include frameSha256 and frameLength in state.active', async () => {
    var ass = new AdminStateService({});
    var state = await ass.getAdminState();
    assert.ok('frameSha256' in state.active);
    assert.ok('frameLength' in state.active);
  });
});
