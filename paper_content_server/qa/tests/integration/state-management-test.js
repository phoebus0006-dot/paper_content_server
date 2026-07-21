const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('AdminStateService — single source of truth', () => {
  let AdminStateService, handleAdminRoutes;

  before(() => {
    AdminStateService = require('../../../src/admin/admin-state-service').AdminStateService;
    handleAdminRoutes = require('../../../src/admin/admin-routes').handleAdminRoutes;
  });

  function mockReq(method, pathname) {
    return {
      method,
      url: pathname,
      headers: { host: 'localhost' },
      socket: { remoteAddress: '127.0.0.1' },
      on: () => {},
    };
  }

  function mockRes() {
    const chunks = [];
    let statusCode = 200;
    let headers = {};
    return {
      _chunks: chunks,
      _statusCode: () => statusCode,
      _headers: () => headers,
      writeHead: function (code, hdrs) {
        statusCode = code;
        headers = { ...headers, ...hdrs };
      },
      end: function (data) {
        chunks.push(Buffer.isBuffer(data) ? data.toString() : String(data || ''));
      },
    };
  }

  it('should return consistent data across dashboard and state endpoints', async () => {
    const ass = new AdminStateService({});
    const state = await ass.getAdminState();
    assert.ok(state);
    assert.ok(state.generatedAt);

    const stateRes = mockRes();
    const dashRes = mockRes();

    await handleAdminRoutes(mockReq('GET', '/api/admin/state'), stateRes, { pathname: '/api/admin/state' }, {}, {
      adminStateService: ass,
      adminAuth: () => true,
    });

    await handleAdminRoutes(mockReq('GET', '/api/admin/dashboard'), dashRes, { pathname: '/api/admin/dashboard' }, {}, {
      adminStateService: ass,
      adminAuth: () => true,
    });

    assert.equal(stateRes._statusCode(), 200);
    assert.equal(dashRes._statusCode(), 200);

    const stateData = JSON.parse(stateRes._chunks.join(''));
    const dashData = JSON.parse(dashRes._chunks.join(''));

    assert.equal(dashData.currentMode, stateData.active.contentMode);
    assert.equal(dashData.frameId, stateData.active.frameId);
    assert.equal(dashData.nextSwitchLocal, stateData.schedule.nextSwitchAt);

    assert.equal(dashRes._headers()['Deprecation'], 'true');
  });

  it('should include Deprecation flag on system/status endpoint', async () => {
    const ass = new AdminStateService({});

    const sysRes = mockRes();
    await handleAdminRoutes(mockReq('GET', '/api/admin/system/status'), sysRes, { pathname: '/api/admin/system/status' }, {}, {
      adminStateService: ass,
      adminAuth: () => true,
    });

    assert.equal(sysRes._statusCode(), 200);
    assert.equal(sysRes._headers()['Deprecation'], 'true');

    const sysData = JSON.parse(sysRes._chunks.join(''));
    assert.ok(sysData.generatedAt);
    assert.ok(sysData.active);
    assert.ok(sysData.health);
  });

  it('should report consistent=false when snapshot mismatch exists', async () => {
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
    const mockOpMode = {
      getCurrentMode: () => ({ mode: 'AUTO', scheduleMode: 'news' })
    };
    const ass = new AdminStateService({
      operatingModeService: mockOpMode,
      snapshotStore: mockSnapshot,
      publicationHistory: mockHistory
    });

    const state = await ass.getAdminState();
    assert.equal(state.consistent, false);
    const mismatch = state.inconsistencies.find(i => i.code === 'SNAPSHOT_MISMATCH');
    assert.ok(mismatch, 'Should detect SNAPSHOT_MISMATCH, got: ' + JSON.stringify(state.inconsistencies));
  });

  it('should report consistent=true when all data is aligned', async () => {
    const snapId = 'snap-1';
    const mockSnapshot = {
      getActiveSnapshot: async () => ({
        snapshotId: snapId,
        frameId: 'news:test-frame',
        mode: 'news',
        createdAt: new Date().toISOString()
      }),
      getFrame: async () => Buffer.alloc(192010, 0x11)
    };
    const mockHistory = {
      list: async () => [{ snapshotId: snapId, publishedAt: new Date().toISOString(), type: 'news' }]
    };
    const mockOpMode = {
      getCurrentMode: () => ({ mode: 'AUTO', scheduleMode: 'news' })
    };
    const ass = new AdminStateService({
      operatingModeService: mockOpMode,
      snapshotStore: mockSnapshot,
      publicationHistory: mockHistory
    });

    const state = await ass.getAdminState();
    assert.equal(state.consistent, true);
    assert.deepEqual(state.inconsistencies, []);
  });

  it('should include frameSha256 and frameLength in state.active', async () => {
    const ass = new AdminStateService({});
    const state = await ass.getAdminState();
    assert.ok('frameSha256' in state.active);
    assert.ok('frameLength' in state.active);
    // frameSha256 is null when no snapshot is loaded (type 'object' for null)
    assert.ok(state.active.frameSha256 === null || typeof state.active.frameSha256 === 'string');
  });
});
