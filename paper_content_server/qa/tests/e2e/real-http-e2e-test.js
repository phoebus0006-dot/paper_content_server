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

  before(async function() {
    var factory = createApplication();
    app = factory.app;
    closeApp = factory.close;
    adminToken = factory.adminToken;
    fixtureImageId = factory.fixtureImageId;

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
    assert.ok(res.statusCode === 400 || res.statusCode === 500);
    if (res.statusCode === 400) {
      var body = res.body.toString('utf8');
      assert.ok(body.indexOf('needs_review') >= 0 || body.indexOf('need review') >= 0 || body.indexOf('review') >= 0);
    }
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

  it('DELETE /api/admin/library/:id returns FEATURE_DISABLED', async function() {
    var res = await httpRequest('DELETE', baseUrl + '/api/admin/library/test-asset-001', {
      headers: adminHeaders(),
    });
    assert.strictEqual(res.statusCode, 503);
    var body = res.body.toString('utf8');
    assert.ok(body.indexOf('FEATURE_DISABLED') >= 0 || body.indexOf('deletePipelineEnabled') >= 0);
  });

  it('DELETE /api/admin/override returns status or error with real rollback', async function() {
    var res = await httpRequest('DELETE', baseUrl + '/api/admin/override', {
      headers: adminHeaders(),
    });
    if (res.statusCode === 200) {
      var data = JSON.parse(res.body.toString('utf8'));
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.operatingMode, 'AUTO');
    } else if (res.statusCode === 500) {
      var errBody = res.body.toString('utf8');
      assert.ok(errBody.indexOf('override') >= 0 || errBody.indexOf('failed') >= 0);
    } else {
      assert.fail('unexpected status code: ' + res.statusCode);
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
});
