const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('path');
const { createApplication: createAppFactory } = require('../../../src/app-factory');

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

describe('Context isolation and photo one-shot', function() {
  var appA, appB;
  var srvA, srvAUrl, srvB, srvBUrl;

  before(async function() {
    appA = createAppFactory({ adminToken: 'token-a-12345' });
    appB = createAppFactory({ adminToken: 'token-b-67890' });
    await appA.ensureInitialized();
    await appB.ensureInitialized();

    // Fix to photo-period time (21:00 UTC -> photo mode) for deterministic photo testing
    var photoTime = new Date('2025-06-15T21:00:00Z');
    appA.runtime.nowProvider = function() { return photoTime; };
    appA.runtime.pinNowProvider = function() { return photoTime.getTime(); };

    srvA = await startServer(appA.app);
    srvAUrl = 'http://127.0.0.1:' + srvA.address().port;
    srvB = await startServer(appB.app);
    srvBUrl = 'http://127.0.0.1:' + srvB.address().port;
  });

  after(async function() {
    if (srvA) { try { await new Promise(function(r) { srvA.close(r); }); } catch(e) {} }
    if (srvB) { try { await new Promise(function(r) { srvB.close(r); }); } catch(e) {} }
    if (appA) { await appA.close(); }
    if (appB) { await appB.close(); }
  });

  it('selects the SAFE/APPROVED/SELECTABLE fixture (imageStatus ready, not fallback)', async function() {
    var R = appA.runtime;
    var now = R.nowProvider ? R.nowProvider() : new Date();
    var serverMod = require('../../../server.js');
    var photo = await serverMod.buildPhotoSnapshot(now, R);
    assert.equal(photo.imageStatus, 'ready', 'expected imageStatus ready, got ' + photo.imageStatus);
    assert.notEqual(photo.imagePath, null, 'expected non-null imagePath');
    assert.ok(photo.imageName.indexOf('e2e-fixture') >= 0 || photo.imageName.indexOf('fixture') >= 0,
      'expected fixture image, got ' + photo.imageName);
    // Verify frameId starts with photo: prefix (not news:)
    assert.ok(photo.frameId.indexOf('photo:') === 0, 'frameId must start with "photo:", got ' + photo.frameId);
  });

  it('two AppFactory instances have distinct contexts, caches, image indexes, file paths', async function() {
    var R1 = appA.runtime;
    var R2 = appB.runtime;

    assert.notEqual(R1, R2, 'contexts must be different objects');
    assert.notEqual(R1.cachedFrames, R2.cachedFrames, 'cachedFrames Maps must be distinct');
    assert.notEqual(R1.cachedSnapshots, R2.cachedSnapshots, 'cachedSnapshots Maps must be distinct');
    assert.notEqual(appA.dataDir, appB.dataDir, 'appFactory dataDir must be distinct');
    assert.notEqual(R1.DATA_DIR, R2.DATA_DIR, 'DATA_DIR path must be distinct');

    R1.cachedFrames.set('test-key', { frame: Buffer.alloc(10) });
    assert.equal(R2.cachedFrames.has('test-key'), false, 'cachedFrames cross-talk detected');

    var imgIdxA = R1.imageIndex || [];
    var imgIdxB = R2.imageIndex || [];
    assert.notEqual(imgIdxA, imgIdxB, 'imageIndex arrays must be distinct');

    var modeA = appA.operatingModeService.getMode();
    appA.operatingModeService.setMode('LEGACY_ADMIN_OVERRIDE');
    assert.equal(appA.operatingModeService.getMode(), 'LEGACY_ADMIN_OVERRIDE');
    assert.equal(appB.operatingModeService.getMode(), 'AUTO', 'operating mode cross-talk detected');
    appA.operatingModeService.setMode(modeA);

    var d1 = R1.IMAGE_INDEX_FILE;
    var d2 = R2.IMAGE_INDEX_FILE;
    assert.notEqual(d1, d2, 'IMAGE_INDEX_FILE path must be distinct');
  });

  it('two instances can run concurrent HTTP requests without cross-talk, different adminTokens', async function() {
    var tokenA = appA.adminToken;
    var tokenB = appB.adminToken;
    assert.notEqual(tokenA, tokenB, 'admin tokens must differ');

    var [resA, resB] = await Promise.all([
      httpRequest('GET', srvAUrl + '/api/admin/access-mode', {
        headers: { 'Authorization': 'Bearer ' + tokenA }
      }),
      httpRequest('GET', srvBUrl + '/api/admin/access-mode', {
        headers: { 'Authorization': 'Bearer ' + tokenB }
      }),
    ]);

    assert.equal(resA.statusCode, 200, 'instance A access-mode failed: ' + resA.statusCode);
    assert.equal(resB.statusCode, 200, 'instance B access-mode failed: ' + resB.statusCode);

    var bodyA = JSON.parse(resA.body.toString());
    var bodyB = JSON.parse(resB.body.toString());
    assert.equal(bodyA.mode, 'token');
    assert.equal(bodyB.mode, 'token');

    // Verify A's token cannot access B's protected endpoints and vice versa
    var [crossA, crossB] = await Promise.all([
      httpRequest('GET', srvBUrl + '/api/admin/state', {
        headers: { 'Authorization': 'Bearer ' + tokenA }
      }),
      httpRequest('GET', srvAUrl + '/api/admin/state', {
        headers: { 'Authorization': 'Bearer ' + tokenB }
      }),
    ]);
    assert.equal(crossA.statusCode, 403, 'A token should be denied on B instance, got ' + crossA.statusCode);
    assert.equal(crossB.statusCode, 403, 'B token should be denied on A instance, got ' + crossB.statusCode);

    // Verify each token works on its own instance's protected endpoint
    var [ownA, ownB] = await Promise.all([
      httpRequest('GET', srvAUrl + '/api/admin/state', {
        headers: { 'Authorization': 'Bearer ' + tokenA }
      }),
      httpRequest('GET', srvBUrl + '/api/admin/state', {
        headers: { 'Authorization': 'Bearer ' + tokenB }
      }),
    ]);
    assert.equal(ownA.statusCode, 200, 'A token on A instance should succeed, got ' + ownA.statusCode);
    assert.equal(ownB.statusCode, 200, 'B token on B instance should succeed, got ' + ownB.statusCode);

    // Verify each instance has its own independent state
    var stA = JSON.parse(ownA.body.toString());
    var stB = JSON.parse(ownB.body.toString());
    // Both instances should have active snapshots after ensureInitialized
    assert.ok(stA.active, 'instance A must have active snapshot');
    assert.ok(stB.active, 'instance B must have active snapshot');
    assert.ok(stA.active.snapshotId, 'instance A snapshotId must be defined');
    assert.ok(stB.active.snapshotId, 'instance B snapshotId must be defined');
    // Different instances should have different snapshot IDs
    assert.notEqual(stA.active.snapshotId, stB.active.snapshotId,
      'instance snapshots should be different');
  });

  it('no-asset photo one-shot returns 200, frame is EPF1 length 192010 (photo content, not news)', async function() {
    var token = appA.adminToken;
    var body = JSON.stringify({ contentType: 'photo' });

    var res = await httpRequest('POST', srvAUrl + '/api/admin/publish/one-shot', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: body,
    });

    assert.equal(res.statusCode, 200, 'one-shot expected 200, got ' + res.statusCode + ': ' + res.body.toString().slice(0, 200));

    var result = JSON.parse(res.body.toString());
    assert.ok(result.snapshotId, 'expected snapshotId in response');
    assert.ok(result.frameId, 'expected frameId in response');
    // frameId must start with one-shot:photo: (photo content, not news)
    assert.ok(result.frameId.indexOf('one-shot:photo:') === 0,
      'expected one-shot:photo: prefix, got ' + result.frameId);
    assert.equal(result.operatingMode, 'ONE_SHOT_OVERRIDE', 'expected ONE_SHOT_OVERRIDE mode');

    // Verify the published snapshot is photo content via admin state
    var adminStateRes = await httpRequest('GET', srvAUrl + '/api/admin/state', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    assert.equal(adminStateRes.statusCode, 200);
    var adminState = JSON.parse(adminStateRes.body.toString());
    assert.ok(adminState.active, 'expected admin state active block');
    // The published content should have photo mode
    assert.equal(adminState.active.contentMode, 'photo',
      'expected contentMode photo, got ' + adminState.active.contentMode);

    var frameRes = await httpRequest('GET', srvAUrl + '/api/frame.bin', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    assert.equal(frameRes.statusCode, 200, 'frame.bin expected 200, got ' + frameRes.statusCode);
    var frameBuf = frameRes.body;
    assert.equal(frameBuf.length, 192010, 'frame.bin length must be 192010, got ' + frameBuf.length);
    var magic = frameBuf.slice(0, 4).toString('ascii');
    assert.equal(magic, 'EPF1', 'frame.bin must start with EPF1 magic, got ' + magic);
  });

  it('isolated request context buildPhotoSnapshot uses fixture image, not fallback or news', async function() {
    var R = appA.runtime;
    var now = R.nowProvider ? R.nowProvider() : new Date();
    var serverMod = require('../../../server.js');
    var photo = await serverMod.buildPhotoSnapshot(now, R);
    // Must use the SAFE/APPROVED/SELECTABLE fixture, not fallback (imageStatus is ready, not empty)
    assert.equal(photo.imageStatus, 'ready', 'must use fixture, not fallback');
    assert.ok(photo.imagePath, 'must have imagePath');
    // frameId must be photo:, not news:
    assert.ok(photo.frameId.indexOf('photo:') === 0, 'frameId prefix must be photo:, got ' + photo.frameId);
    // Verify the fixture entry is approved via isImageApproved
    var fixtureEntry = R.imageIndex.find(function(e) { return e.id === appA.fixtureImageId; });
    assert.ok(fixtureEntry, 'fixture entry must exist in imageIndex');
    assert.ok(serverMod.isImageApproved(fixtureEntry), 'fixture entry must be approved (SAFE/APPROVED/SELECTABLE)');
  });
});
