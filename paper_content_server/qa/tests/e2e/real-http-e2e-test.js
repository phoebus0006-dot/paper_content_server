const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

var DRAFT_ITEMS = [
  { title: 'Breaking News: Test Event One', summary: 'This is a summary of the first test event in our E2E test suite.', url: 'https://example.com/news/1', source: 'e2e-test', category: 'technology' },
  { title: 'Market Update: Stocks Rise Sharply', summary: 'Global markets showed strong performance in today\'s trading session across all major indices.', url: 'https://example.com/news/2', source: 'e2e-test', category: 'finance' },
  { title: 'Science Discovery: New Research Published', summary: 'Researchers have published groundbreaking findings in the field of quantum computing this week.', url: 'https://example.com/news/3', source: 'e2e-test', category: 'science' },
  { title: 'Sports Highlights: Championship Results', summary: 'The national championship game ended with a stunning upset that surprised all spectators.', url: 'https://example.com/news/4', source: 'e2e-test', category: 'sports' },
  { title: 'Weather Alert: Storm Approaching Coast', summary: 'Meteorologists have issued a warning for severe weather conditions expected this weekend.', url: 'https://example.com/news/5', source: 'e2e-test', category: 'weather' },
  { title: 'Tech Innovation: AI Breakthrough Achieved', summary: 'A major breakthrough in artificial intelligence research was announced at the annual conference.', url: 'https://example.com/news/6', source: 'e2e-test', category: 'technology' },
];

describe('Real HTTP E2E Tests', function() {
  var app;
  var server;
  var baseUrl;
  var closeApp;
  var adminToken;
  var fixtureImageId;
  var dataDir;

  before(async function() {
    var factory = createApplication();
    app = factory.app;
    closeApp = factory.close;
    adminToken = factory.adminToken;
    fixtureImageId = factory.fixtureImageId;
    dataDir = factory.dataDir;

    await factory.ensureInitialized();

    await new Promise(function(resolve, reject) {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', function() {
        var addr = server.address();
        baseUrl = 'http://127.0.0.1:' + addr.port;
        resolve();
      });
      server.on('error', reject);
    });
  });

  after(async function() {
    if (server) {
      await new Promise(function(resolve) { server.close(resolve); });
    }
    if (closeApp) {
      await closeApp();
    }
  });

  function adminHeaders() {
    return { 'Authorization': 'Bearer ' + adminToken, 'Content-Type': 'application/json' };
  }

  it('GET /api/admin/state returns admin state', async function() {
    var res = await httpRequest('GET', baseUrl + '/api/admin/state', {
      headers: adminHeaders(),
    });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/json') >= 0);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data !== null && typeof data === 'object');
    assert.ok('active' in data);
    assert.ok('generatedAt' in data);
    assert.ok(data.active !== null);
    assert.ok(data.active.operatingMode !== undefined, 'active.operatingMode missing');
  });

  it('GET /api/admin/dashboard returns dashboard data', async function() {
    var res = await httpRequest('GET', baseUrl + '/api/admin/dashboard', {
      headers: adminHeaders(),
    });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/json') >= 0);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data !== null && typeof data === 'object');
    assert.ok('active' in data);
    assert.ok('generatedAt' in data);
  });

  it('POST /api/admin/news/draft saves draft with 6 items', async function() {
    var res = await httpRequest('POST', baseUrl + '/api/admin/news/draft', {
      headers: adminHeaders(),
      body: JSON.stringify({ items: DRAFT_ITEMS }),
    });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/json') >= 0);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data.status === 'ok' || data.status === 'saved');
    assert.ok(data.items);
    assert.strictEqual(data.items.length, 6);
    data.items.forEach(function(item, idx) {
      assert.ok(item.titleStatus);
      assert.ok(DRAFT_ITEMS[idx].title.indexOf(item.title || '') >= 0 || (item.title && DRAFT_ITEMS[idx].title.indexOf(item.title) >= 0));
    });
  });

  it('POST /api/admin/publish/news fails with needs_review check', async function() {
    var res = await httpRequest('POST', baseUrl + '/api/admin/publish/news', {
      headers: adminHeaders(),
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.statusCode, 409, 'expected 409 when items need review');
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data.error, 'response must have error object');
    assert.strictEqual(data.error.code, 'NEWS_REVIEW_REQUIRED', 'error.code must be NEWS_REVIEW_REQUIRED');
    assert.ok(Array.isArray(data.error.blockedItems), 'blockedItems must be an array');
    assert.ok(data.error.blockedItems.length > 0, 'blockedItems must not be empty');
  });

  it('POST /api/admin/photo-preview returns processed image PNG', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    var res = await httpRequest('POST', baseUrl + '/api/admin/photo-preview', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: fixtureImageId, recipe: { fitMode: 'contain', background: '#ffffff' } }),
    });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('image/png') >= 0);
    assert.ok(res.body.length > 100);
    // Verify PNG magic bytes: 0x89 P N G
    assert.ok(res.body.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47])), 'PNG magic bytes header missing');
    assert.ok(res.headers['x-source-hash']);
    assert.ok(res.headers['x-recipe-hash']);
    assert.ok(res.headers['x-processed-image-hash']);
  });

  it('POST /api/admin/photo-eink-preview returns eink preview with full headers', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    var res = await httpRequest('POST', baseUrl + '/api/admin/photo-eink-preview', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: fixtureImageId, recipe: { fitMode: 'contain', background: '#ffffff' } }),
    });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('image/png') >= 0);
    assert.ok(res.body.length > 100);
    assert.ok(res.headers['x-source-hash'], 'X-Source-Hash header missing');
    assert.ok(res.headers['x-recipe-hash'], 'X-Recipe-Hash header missing');
    assert.ok(res.headers['x-processed-image-hash'], 'X-Processed-Image-Hash header missing');
    assert.ok(res.headers['x-frame-sha256'], 'X-Frame-Sha256 header missing');
    assert.ok(res.headers['x-frame-length'], 'X-Frame-Length header missing');
    assert.ok(res.headers['x-renderer-version'], 'X-Renderer-Version header missing');
    assert.ok(parseInt(res.headers['x-frame-length'], 10) > 0);
    assert.ok(res.headers['x-frame-sha256'].length === 64);
  });

  it('DELETE /api/admin/library/:id returns 503 FEATURE_DISABLED (disabled feature contract test)', async function() {
    var res = await httpRequest('DELETE', baseUrl + '/api/admin/library/test-asset-001', {
      headers: adminHeaders(),
    });
    assert.strictEqual(res.statusCode, 503);
    var body = JSON.parse(res.body.toString('utf8'));
    assert.strictEqual(body.error, 'FEATURE_DISABLED: deletePipelineEnabled is false');
  });

  it('DELETE /api/admin/override restores AUTO mode with consistent state', async function() {
    var res = await httpRequest('DELETE', baseUrl + '/api/admin/override', {
      headers: adminHeaders(),
    });
    assert.strictEqual(res.statusCode, 200);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.operatingMode, 'AUTO');

    // State consistency read-back
    var stateRes = await httpRequest('GET', baseUrl + '/api/admin/state', {
      headers: adminHeaders(),
    });
    assert.strictEqual(stateRes.statusCode, 200);
    var stateData = JSON.parse(stateRes.body.toString('utf8'));

    // Frame consistency read-back
    var frameRes = await httpRequest('GET', baseUrl + '/api/frame.bin', { headers: {} });
    assert.strictEqual(frameRes.statusCode, 200);
    assert.strictEqual(frameRes.body.length, 192010);
    var computedSha = require('crypto').createHash('sha256').update(frameRes.body).digest('hex');
    assert.strictEqual(computedSha, frameRes.headers['x-frame-sha256'], 'Computed SHA256 must match header');

    // Verify state/frame consistency
    if (stateData.active && stateData.active.frameId) {
      assert.strictEqual(stateData.active.frameId, frameRes.headers['x-frame-id'],
        'frameId mismatch between state and frame.bin');
      assert.strictEqual(stateData.active.frameSha256, frameRes.headers['x-frame-sha256'],
        'frameSha256 mismatch between state and frame.bin');
      assert.strictEqual(stateData.active.frameLength, frameRes.body.length,
        'frameLength mismatch between state and frame.bin length');
    }
  });

  it('GET /api/state.json returns device state', async function() {
    var res = await httpRequest('GET', baseUrl + '/api/state.json', { headers: {} });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/json') >= 0);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data !== null && typeof data === 'object');
    assert.ok(data.active !== undefined || data.panelIndex !== undefined || data.mode !== undefined);
    assert.ok(data.frameId !== undefined || data.mode !== undefined);
  });

  it('GET /api/frame.bin returns binary EPF1 frame', async function() {
    var res = await httpRequest('GET', baseUrl + '/api/frame.bin', { headers: {} });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/octet-stream') >= 0 || ct.indexOf('application/json') >= 0);
    if (res.statusCode === 200 && ct.indexOf('octet-stream') >= 0) {
      assert.strictEqual(res.body.length, 192010);
      var magic = res.body.toString('ascii', 0, 4);
      assert.strictEqual(magic, 'EPF1');
      assert.ok(res.headers['x-frame-sha256']);
      assert.strictEqual(res.headers['x-frame-sha256'].length, 64);
    }
  });

  it('GET /api/admin/photo-preview works with photo-eink-preview as separate call', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    var resPng = await httpRequest('POST', baseUrl + '/api/admin/photo-preview', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: fixtureImageId, recipe: { fitMode: 'contain', background: '#ffffff' } }),
    });
    assert.strictEqual(resPng.statusCode, 200);
    var resEink = await httpRequest('POST', baseUrl + '/api/admin/photo-eink-preview', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: fixtureImageId, recipe: { fitMode: 'contain', background: '#ffffff' } }),
    });
    assert.strictEqual(resEink.statusCode, 200);
    assert.ok(resPng.body.length > 100);
    assert.ok(resEink.body.length > 100);
    assert.notStrictEqual(resPng.headers['x-source-hash'], undefined);
    assert.notStrictEqual(resEink.headers['x-source-hash'], undefined);
    assert.notStrictEqual(resEink.headers['x-renderer-version'], undefined);
  });

  // ── new tests ──

  it('GET /api/admin/state, dashboard, and system/status have consistent fields', async function() {
    var resState = await httpRequest('GET', baseUrl + '/api/admin/state', {
      headers: adminHeaders(),
    });
    assert.strictEqual(resState.statusCode, 200);
    var stateData = JSON.parse(resState.body.toString('utf8'));

    var resDash = await httpRequest('GET', baseUrl + '/api/admin/dashboard', {
      headers: adminHeaders(),
    });
    assert.strictEqual(resDash.statusCode, 200);
    var dashData = JSON.parse(resDash.body.toString('utf8'));

    var resStatus = await httpRequest('GET', baseUrl + '/api/admin/system/status', {
      headers: adminHeaders(),
    });
    assert.strictEqual(resStatus.statusCode, 200);
    var statusData = JSON.parse(resStatus.body.toString('utf8'));

    // state and system/status should have identical active fields
    assert.strictEqual(stateData.active.operatingMode, statusData.active.operatingMode,
      'operatingMode mismatch');
    assert.strictEqual(stateData.active.contentMode, statusData.active.contentMode,
      'contentMode mismatch');
    assert.strictEqual(stateData.active.snapshotId, statusData.active.snapshotId,
      'snapshotId mismatch');
    assert.strictEqual(stateData.active.frameId, statusData.active.frameId,
      'frameId mismatch');
    assert.strictEqual(stateData.active.frameSha256, statusData.active.frameSha256,
      'frameSha256 mismatch');
    assert.strictEqual(stateData.active.frameLength, statusData.active.frameLength,
      'frameLength mismatch');

    // dashboard returns the spread admin state so active fields are nested
    assert.strictEqual(dashData.active.frameId, stateData.active.frameId,
      'dashboard frameId mismatch');
  });

  it('GET /api/health.json returns OK', async function() {
    var res = await httpRequest('GET', baseUrl + '/api/health.json', { headers: {} });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/json') >= 0);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.strictEqual(data.status, 'ok');
  });

  it('POST /api/admin/publish/news fails with pending reviewStatus', async function() {
    // The draft items created by the setup have needs_review → pending status
    var res = await httpRequest('POST', baseUrl + '/api/admin/publish/news', {
      headers: adminHeaders(),
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.statusCode, 409, 'expected 409 when items have pending reviewStatus');
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data.error, 'response must have error object');
    assert.strictEqual(data.error.code, 'NEWS_REVIEW_REQUIRED', 'error.code must be NEWS_REVIEW_REQUIRED');
    assert.ok(Array.isArray(data.error.blockedItems), 'blockedItems must be an array');
    assert.ok(data.error.blockedItems.length > 0, 'blockedItems must not be empty');
  });

  it('GET /api/frame.bin has correct length and SHA header', async function() {
    var res = await httpRequest('GET', baseUrl + '/api/frame.bin', { headers: {} });
    assert.strictEqual(res.statusCode, 200);
    var ct = res.headers['content-type'] || '';
    assert.ok(ct.indexOf('application/octet-stream') >= 0, 'expected octet-stream content type');

    assert.ok(res.headers['x-frame-id'], 'X-Frame-Id header missing');
    assert.ok(res.headers['x-frame-sha256'], 'X-Frame-Sha256 header missing');
    assert.strictEqual(res.headers['x-frame-sha256'].length, 64, 'X-Frame-Sha256 must be 64 hex chars');
    assert.strictEqual(res.body.length, 192010, 'frame.bin body length must be 192010');

    var computedSha = crypto.createHash('sha256').update(res.body).digest('hex');
    assert.strictEqual(computedSha, res.headers['x-frame-sha256'], 'Computed SHA256 must match header');
  });

  it('POST /api/admin/publish/news with approved items succeeds', async function() {
    // Try to restore the system to a valid state first
    try {
      await httpRequest('DELETE', baseUrl + '/api/admin/override', {
        headers: adminHeaders(),
      });
    } catch (ignored) {
      // best-effort restore
    }

    // Save a fresh draft
    var draftRes = await httpRequest('POST', baseUrl + '/api/admin/news/draft', {
      headers: adminHeaders(),
      body: JSON.stringify({ items: DRAFT_ITEMS }),
    });
    assert.strictEqual(draftRes.statusCode, 200);

    // Approve all items via HTTP endpoint instead of editing the file directly
    var approveRes = await httpRequest('POST', baseUrl + '/api/admin/news/draft/approve-all', {
      headers: adminHeaders(),
    });
    assert.strictEqual(approveRes.statusCode, 200, 'approve-all should succeed');
    var approveData = JSON.parse(approveRes.body.toString('utf8'));
    assert.strictEqual(approveData.status, 'ok');

    // Publish should now succeed
    var pubRes = await httpRequest('POST', baseUrl + '/api/admin/publish/news', {
      headers: adminHeaders(),
      body: JSON.stringify({}),
    });
    assert.strictEqual(pubRes.statusCode, 200, 'publish should succeed with approved items');

    // Read-back: GET /api/admin/state
    var stateRes = await httpRequest('GET', baseUrl + '/api/admin/state', {
      headers: adminHeaders(),
    });
    assert.strictEqual(stateRes.statusCode, 200);
    var stateData = JSON.parse(stateRes.body.toString('utf8'));

    // Read-back: GET /api/frame.bin
    var frameRes = await httpRequest('GET', baseUrl + '/api/frame.bin', { headers: {} });
    assert.strictEqual(frameRes.statusCode, 200);

    // Verify frame.bin self-consistency (length and SHA)
    assert.ok(frameRes.headers['x-frame-sha256'], 'X-Frame-Sha256 header missing');
    assert.strictEqual(frameRes.body.length, 192010, 'frame.bin body length must be 192010');
    var computedSha = crypto.createHash('sha256').update(frameRes.body).digest('hex');
    assert.strictEqual(computedSha, frameRes.headers['x-frame-sha256'], 'Computed SHA256 must match header');

    // Verify state/frame consistency if state has a valid frameId
    if (stateData.active && stateData.active.frameId) {
      assert.strictEqual(stateData.active.frameId, frameRes.headers['x-frame-id'],
        'frameId mismatch between state and frame.bin');
      assert.strictEqual(stateData.active.frameSha256, frameRes.headers['x-frame-sha256'],
        'frameSha256 mismatch between state and frame.bin');
      assert.strictEqual(stateData.active.frameLength, frameRes.body.length,
        'frameLength mismatch between state and frame.bin length');
    }
  });

  it('POST /api/admin/photo-preview returns recipe hashes', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    var res = await httpRequest('POST', baseUrl + '/api/admin/photo-preview', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: fixtureImageId, recipe: { fitMode: 'contain', background: '#ffffff' } }),
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['x-source-hash'], 'X-Source-Hash missing');
    assert.ok(res.headers['x-recipe-hash'], 'X-Recipe-Hash missing');
    assert.ok(res.headers['x-processed-image-hash'], 'X-Processed-Image-Hash missing');
    // Verify PNG is valid (non-empty, starts with PNG magic)
    assert.ok(res.body.length > 0, 'PNG body should be non-empty');
    assert.ok(res.body.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47])), 'PNG magic bytes header missing');
  });

  // ── Photo publish tests ──

  it('POST /api/admin/publish/photo with fixture image succeeds', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }

    // Publish the fixture image
    var pubRes = await httpRequest('POST', baseUrl + '/api/admin/publish/photo', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: fixtureImageId }),
    });
    assert.strictEqual(pubRes.statusCode, 200);
    var pubData = JSON.parse(pubRes.body.toString('utf8'));
    assert.ok(pubData.frameId, 'response must have frameId');

    // State read-back
    var stateRes = await httpRequest('GET', baseUrl + '/api/admin/state', {
      headers: adminHeaders(),
    });
    assert.strictEqual(stateRes.statusCode, 200);
    var stateData = JSON.parse(stateRes.body.toString('utf8'));
    assert.strictEqual(stateData.active.contentMode, 'photo');
    assert.ok(stateData.active.frameId && (stateData.active.frameId.indexOf('photo:') === 0 || stateData.active.frameId.indexOf('manual-photo:') === 0),
      'frameId must start with photo: or manual-photo: got ' + stateData.active.frameId);

    // Frame read-back and SHA verification
    var frameRes = await httpRequest('GET', baseUrl + '/api/frame.bin', { headers: {} });
    assert.strictEqual(frameRes.statusCode, 200);
    assert.strictEqual(frameRes.body.length, 192010, 'frame.bin body length must be 192010');
    var computedSha = require('crypto').createHash('sha256').update(frameRes.body).digest('hex');
    assert.strictEqual(computedSha, frameRes.headers['x-frame-sha256'], 'Computed SHA256 must match header');

    // Verify state/frame consistency
    if (stateData.active && stateData.active.frameId) {
      assert.strictEqual(stateData.active.frameId, frameRes.headers['x-frame-id'],
        'frameId mismatch between state and frame.bin');
      assert.strictEqual(stateData.active.frameSha256, frameRes.headers['x-frame-sha256'],
        'frameSha256 mismatch between state and frame.bin');
      assert.strictEqual(stateData.active.frameLength, frameRes.body.length,
        'frameLength mismatch between state and frame.bin length');
    }

    // Verify history contains the published photo
    var histRes = await httpRequest('GET', baseUrl + '/api/admin/publish-history', {
      headers: adminHeaders(),
    });
    assert.strictEqual(histRes.statusCode, 200);
    var historyBody = JSON.parse(histRes.body.toString('utf8'));
    var historyArr = historyBody.history || historyBody;
    assert.ok(Array.isArray(historyArr) && historyArr.length > 0, 'publish history must not be empty');
    assert.ok(historyArr[0].frameId, 'most recent history entry must have frameId');
  });

  it('POST /api/admin/publish/photo rejects PENDING review status', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    // Add a PENDING entry to image_index.json
    var idxPath = path.join(dataDir, 'image_index.json');
    var idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    var pendingId = 'e2e-pending-' + Date.now().toString(36);
    idx.push({
      id: pendingId,
      title: 'E2E Pending Test',
      source: 'test',
      safetyStatus: 'pending',
      reviewStatus: 'PENDING',
      lifecycleStatus: 'QUARANTINED',
      rawPath: 'data/fixture-test-image.png',
    });
    fs.writeFileSync(idxPath, JSON.stringify(idx));

    var res = await httpRequest('POST', baseUrl + '/api/admin/publish/photo', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: pendingId }),
    });
    assert.strictEqual(res.statusCode, 400);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data.error.indexOf('PENDING') >= 0, 'error must mention PENDING status');
  });

  it('POST /api/admin/publish/photo rejects REJECTED review status', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    var idxPath = path.join(dataDir, 'image_index.json');
    var idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    var rejectedId = 'e2e-rejected-' + Date.now().toString(36);
    idx.push({
      id: rejectedId,
      title: 'E2E Rejected Test',
      source: 'test',
      safetyStatus: 'SAFE',
      reviewStatus: 'REJECTED',
      lifecycleStatus: 'TOMBSTONED',
      rawPath: 'data/fixture-test-image.png',
    });
    fs.writeFileSync(idxPath, JSON.stringify(idx));

    var res = await httpRequest('POST', baseUrl + '/api/admin/publish/photo', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: rejectedId }),
    });
    assert.strictEqual(res.statusCode, 400);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data.error.indexOf('REJECTED') >= 0, 'error must mention REJECTED status');
  });

  it('POST /api/admin/publish/photo rejects QUARANTINED lifecycle status', async function() {
    if (!fixtureImageId) {
      this.skip('no fixture image available');
      return;
    }
    var idxPath = path.join(dataDir, 'image_index.json');
    var idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    var quarantinedId = 'e2e-quarantined-' + Date.now().toString(36);
    idx.push({
      id: quarantinedId,
      title: 'E2E Quarantined Test',
      source: 'test',
      safetyStatus: 'SAFE',
      reviewStatus: 'APPROVED',
      lifecycleStatus: 'QUARANTINED',
      rawPath: 'data/fixture-test-image.png',
    });
    fs.writeFileSync(idxPath, JSON.stringify(idx));

    var res = await httpRequest('POST', baseUrl + '/api/admin/publish/photo', {
      headers: adminHeaders(),
      body: JSON.stringify({ photoId: quarantinedId }),
    });
    assert.strictEqual(res.statusCode, 400);
    var data = JSON.parse(res.body.toString('utf8'));
    assert.ok(data.error.indexOf('QUARANTINED') >= 0, 'error must mention QUARANTINED status');
  });
});
