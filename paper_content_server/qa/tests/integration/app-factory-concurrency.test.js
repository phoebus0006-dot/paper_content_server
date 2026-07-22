const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApplication } = require('../../../src/app-factory');

function httpRequest(method, url, options) {
  options = options || {};
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var opts = {
      method: method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + (u.search || ''),
      headers: options.headers || {},
    };
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        res.body = Buffer.concat(chunks);
        resolve(res);
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function startServer(handler) {
  return new Promise(function(resolve, reject) {
    var srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', function() {
      resolve(srv);
    });
    srv.on('error', reject);
  });
}

describe('AppFactory Concurrency & Instance Isolation', function() {
  var appA, appB, srvA, srvAUrl, srvB, srvBUrl;

  before(async function() {
    appA = createApplication({ adminToken: 'conc-token-A' });
    appB = createApplication({ adminToken: 'conc-token-B' });
    await appA.ensureInitialized();
    await appB.ensureInitialized();
    // Fix time to photo period so both instances are deterministic
    var fixedNow = new Date('2025-06-15T21:00:00Z');
    appA.runtime.nowProvider = function() { return fixedNow; };
    appB.runtime.nowProvider = function() { return fixedNow; };
    srvA = await startServer(appA.app);
    srvAUrl = 'http://127.0.0.1:' + srvA.address().port;
    srvB = await startServer(appB.app);
    srvBUrl = 'http://127.0.0.1:' + srvB.address().port;
  });

  after(async function() {
    var cleanup = [];
    if (srvA) cleanup.push(new Promise(function(r) { try { srvA.close(r); } catch(e) { r(); } }));
    if (srvB) cleanup.push(new Promise(function(r) { try { srvB.close(r); } catch(e) { r(); } }));
    await Promise.all(cleanup);
    if (appA) await appA.close();
    if (appB) await appB.close();
  });

  it('allows two App instances to run concurrently with isolated dataDirs, modes, and admin tokens', async function() {
    assert.notEqual(appA.adminToken, appB.adminToken, 'admin tokens must differ');
    assert.equal(appA.adminToken, 'conc-token-A');
    assert.equal(appB.adminToken, 'conc-token-B');

    appA.operatingModeService.setMode('LEGACY_ADMIN_OVERRIDE');

    assert.equal(appA.operatingModeService.getMode(), 'LEGACY_ADMIN_OVERRIDE');
    assert.equal(appB.operatingModeService.getMode(), 'AUTO');
    assert.notEqual(appA.dataDir, appB.dataDir);

    var stateA = await appA.runtime.adminStateService.getAdminState();
    var stateB = await appB.runtime.adminStateService.getAdminState();

    assert.equal(stateA.active.operatingMode, 'LEGACY_ADMIN_OVERRIDE');
    assert.equal(stateB.active.operatingMode, 'AUTO');
  });

  it('concurrent protected-endpoint requests: A token cannot access B, B cannot access A, state is isolated', async function() {
    var tokenA = 'conc-token-A';
    var tokenB = 'conc-token-B';

    // Fire all four requests concurrently:
    // 1. A on A (should succeed, 200)
    // 2. B on B (should succeed, 200)
    // 3. A on B (should fail, 403)
    // 4. B on A (should fail, 403)
    var results = await Promise.all([
      httpRequest('GET', srvAUrl + '/api/admin/state', { headers: { 'Authorization': 'Bearer ' + tokenA } }),
      httpRequest('GET', srvBUrl + '/api/admin/state', { headers: { 'Authorization': 'Bearer ' + tokenB } }),
      httpRequest('GET', srvBUrl + '/api/admin/state', { headers: { 'Authorization': 'Bearer ' + tokenA } }),
      httpRequest('GET', srvAUrl + '/api/admin/state', { headers: { 'Authorization': 'Bearer ' + tokenB } }),
    ]);

    var ownA = results[0], ownB = results[1], crossAB = results[2], crossBA = results[3];

    assert.equal(ownA.statusCode, 200, 'A on A should succeed, got ' + ownA.statusCode);
    assert.equal(ownB.statusCode, 200, 'B on B should succeed, got ' + ownB.statusCode);
    assert.equal(crossAB.statusCode, 403, 'A on B should be forbidden, got ' + crossAB.statusCode);
    assert.equal(crossBA.statusCode, 403, 'B on A should be forbidden, got ' + crossBA.statusCode);

    // Verify instance state is truly isolated - different snapshot IDs
    var stA = JSON.parse(ownA.body.toString());
    var stB = JSON.parse(ownB.body.toString());
    assert.ok(stA.active, 'instance A must have active snapshot');
    assert.ok(stB.active, 'instance B must have active snapshot');
    assert.ok(stA.active.snapshotId, 'instance A snapshotId must be defined');
    assert.ok(stB.active.snapshotId, 'instance B snapshotId must be defined');
    assert.notEqual(stA.active.snapshotId, stB.active.snapshotId,
      'instance snapshots must differ');

    // Verify each instance has its own cachedFrames (no cross-talk)
    appA.runtime.cachedFrames.set('conc-test-key', { data: 'from-A' });
    assert.equal(appB.runtime.cachedFrames.has('conc-test-key'), false,
      'cachedFrames must not leak between instances');
    appA.runtime.cachedFrames.delete('conc-test-key');
  });

  it('concurrent one-shot publish on both instances produces isolated state', async function() {
    var tokenA = 'conc-token-A';
    var tokenB = 'conc-token-B';

    // Publish one-shot on both instances concurrently
    var osBody = JSON.stringify({ contentType: 'photo' });
    var pubResults = await Promise.all([
      httpRequest('POST', srvAUrl + '/api/admin/publish/one-shot', {
        headers: { 'Authorization': 'Bearer ' + tokenA, 'Content-Type': 'application/json' },
        body: osBody,
      }),
      httpRequest('POST', srvBUrl + '/api/admin/publish/one-shot', {
        headers: { 'Authorization': 'Bearer ' + tokenB, 'Content-Type': 'application/json' },
        body: osBody,
      }),
    ]);

    assert.equal(pubResults[0].statusCode, 200, 'A one-shot failed: ' + pubResults[0].statusCode);
    assert.equal(pubResults[1].statusCode, 200, 'B one-shot failed: ' + pubResults[1].statusCode);

    var resultA = JSON.parse(pubResults[0].body.toString());
    var resultB = JSON.parse(pubResults[1].body.toString());

    // Both should be one-shot:photo: prefix
    assert.ok(resultA.frameId.indexOf('one-shot:photo:') === 0, 'A frameId prefix wrong: ' + resultA.frameId);
    assert.ok(resultB.frameId.indexOf('one-shot:photo:') === 0, 'B frameId prefix wrong: ' + resultB.frameId);

    // Snapshot IDs must differ (different instances)
    assert.notEqual(resultA.snapshotId, resultB.snapshotId,
      'concurrent one-shot snapshots must be different');

    // Verify each instance's state after concurrent publish is correct
    var [stARes, stBRes] = await Promise.all([
      httpRequest('GET', srvAUrl + '/api/admin/state', { headers: { 'Authorization': 'Bearer ' + tokenA } }),
      httpRequest('GET', srvBUrl + '/api/admin/state', { headers: { 'Authorization': 'Bearer ' + tokenB } }),
    ]);

    assert.equal(stARes.statusCode, 200);
    assert.equal(stBRes.statusCode, 200);

    var stA = JSON.parse(stARes.body.toString());
    var stB = JSON.parse(stBRes.body.toString());

    // contentMode should be photo for both
    assert.ok(stA.active, 'instance A must have active snapshot');
    assert.ok(stB.active, 'instance B must have active snapshot');
    assert.equal(stA.active.contentMode, 'photo', 'A contentMode should be photo');
    assert.equal(stB.active.contentMode, 'photo', 'B contentMode should be photo');
    // Snapshot IDs in state should match the one-shot response
    assert.ok(stA.active.snapshotId, 'instance A snapshotId must be defined');
    assert.ok(stB.active.snapshotId, 'instance B snapshotId must be defined');
    assert.equal(stA.active.snapshotId, resultA.snapshotId, 'A state snapshotId must match publish result');
    assert.equal(stB.active.snapshotId, resultB.snapshotId, 'B state snapshotId must match publish result');
  });
});
