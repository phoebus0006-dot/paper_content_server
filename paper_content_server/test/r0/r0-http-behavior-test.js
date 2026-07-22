#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');
var net = require('net');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');

var dataDir = null;
var inst = null;

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}

function findFreePort() {
  return new Promise(function(resolve, reject) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function() {
      var port = s.address().port;
      s.close(function() { resolve(port); });
    });
    s.on('error', reject);
  });
}

function makeTmpDir() {
  var d = path.join(os.tmpdir(), 'r0_http_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, 'images'), { recursive: true });
  fs.writeFileSync(path.join(d, 'feeds.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(d, 'config.json'), '{}', 'utf8');
  return d;
}

function captureTrackedHashes() {
  var result = {};
  try {
    var files = cp.execSync('git ls-files data/', {cwd: ROOT, encoding: 'utf8', stdio: ['pipe','pipe','ignore']}).trim().split('\n').filter(Boolean);
    files.forEach(function(f) {
      var fp = path.join(ROOT, f);
      try {
        var buf = fs.readFileSync(fp);
        result[f] = crypto.createHash('sha256').update(buf).digest('hex');
      } catch(e) { result[f] = null; }
    });
  } catch(e) {}
  return result;
}

function compareHashes(before, after) {
  var changed = [];
  Object.keys(after).forEach(function(f) {
    if (before[f] !== after[f]) changed.push(f);
  });
  return changed;
}

function waitForSrv(baseUrl, timeout) {
  var deadline = Date.now() + timeout;
  return new Promise(function(resolve, reject) {
    function poll() {
      if (Date.now() > deadline) return reject(new Error('server did not start'));
      var req = http.get(baseUrl + '/api/state.json', function (res) {
        if (res.statusCode === 200) { res.resume(); return resolve(); }
        res.resume(); setTimeout(poll, 200);
      });
      req.on('error', function () { setTimeout(poll, 200); });
      req.end();
    }
    poll();
  });
}

function spawnSrv(tmpDir, port) {
  var env = {
    PORT: String(port),
    DATA_DIR: tmpDir,
    IMAGE_ROOT: path.join(tmpDir, 'images'),
    FEEDS_FILE: path.join(tmpDir, 'feeds.json'),
    NEWS_CACHE_FILE: path.join(tmpDir, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(tmpDir, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(tmpDir, 'news_rotation.json'),
    IMAGE_INDEX_FILE: path.join(tmpDir, 'image_index.json'),
    LAST_GOOD_NEWS_FILE: path.join(tmpDir, 'last_good_news.json'),
    CONFIG_FILE: path.join(tmpDir, 'config.json'),
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: 'test-token-123',
    TRANSLATION_PROVIDER: 'none',
    TZ: 'UTC',
  };
  var child = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', function () {});
  var base = 'http://127.0.0.1:' + port;
  return { child: child, port: port, base: base, dataDir: tmpDir };
}

function stopSrv(inst) {
  return new Promise(function (resolve) {
    if (!inst || !inst.child) return resolve();
    var t = setTimeout(function () { try { inst.child.kill('SIGKILL'); } catch (e) {} resolve(); }, 4000);
    inst.child.on('exit', function () { clearTimeout(t); resolve(); });
    try { inst.child.kill('SIGTERM'); } catch (e) { clearTimeout(t); resolve(); }
  });
}

function request(method, baseUrl, reqPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var url = new URL(baseUrl);
    var opts = {
      method: method,
      hostname: '127.0.0.1',
      port: url.port,
      path: reqPath,
      headers: Object.assign({}, headers || {}),
    };
    var r = http.request(opts, function (res) {
      var data = [];
      res.on('data', function (c) { data.push(c); });
      res.on('end', function () {
        var buf = Buffer.concat(data);
        var parsed = null;
        try { parsed = JSON.parse(buf.toString('utf8')); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed || buf.toString('utf8'), raw: buf, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body !== undefined && body !== null) {
      var bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      r.write(bodyStr);
    }
    r.end();
  });
}

console.log('=== R0 HTTP Behavior Test ===');

async function main() {
  dataDir = makeTmpDir();
  var port = await findFreePort();
  var beforeHashes = captureTrackedHashes();

  // Create test asset BEFORE starting the server so assets.json is present at startup
  var imgBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var imgBuf = Buffer.from(imgBase64, 'base64');
  var imgPath = path.join(dataDir, 'test-asset.png');
  fs.writeFileSync(imgPath, imgBuf);
  var assetStorePath = path.join(dataDir, 'assets.json');
  fs.writeFileSync(assetStorePath, JSON.stringify({
    schemaVersion: 1,
    assets: {
      'test-asset-1': {
        assetId: 'test-asset-1',
        localPath: imgPath,
        libraryType: 'custom',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        sha256: 'abc',
        createdAt: new Date().toISOString(),
      }
    }
  }, null, 2), 'utf8');

  try {
    inst = spawnSrv(dataDir, port);
    await waitForSrv(inst.base, 15000);
  } catch (e) {
    t('R0_SRV_START', false, 'server failed to start');
    if (inst) await stopSrv(inst);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (ex) {}
    console.log('\n=== R0 HTTP Behavior: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(1);
  }

  var AUTH_HEADERS = { 'Authorization': 'Bearer test-token-123' };
  var ORIGIN_HEADERS = {
    'Authorization': 'Bearer test-token-123',
    'Origin': 'http://127.0.0.1:' + port,
    'Referer': 'http://127.0.0.1:' + port + '/admin/',
  };

  try {
    // --- R0_10: GET /api/state.json returns 200 ---
    var r0_10 = await request('GET', inst.base, '/api/state.json');
    t('R0_10_STATE_JSON_200', r0_10.status === 200, 'status=' + r0_10.status);

    // --- R0_11a: GET /api/admin/library/nonexistent/full without auth returns 403 ---
    var r0_11a = await request('GET', inst.base, '/api/admin/library/nonexistent/full');
    t('R0_11_LIBRARY_FULL_NO_AUTH_403', r0_11a.status === 403, 'status=' + r0_11a.status);

    // --- R0_11b: GET /api/admin/library/nonexistent/full with auth returns 404 ---
    var r0_11b = await request('GET', inst.base, '/api/admin/library/nonexistent/full', null, AUTH_HEADERS);
    t('R0_11_LIBRARY_FULL_AUTH_404', r0_11b.status === 404, 'status=' + r0_11b.status);

    // --- R0_11c: REAL asset test - asset was written to assets.json before server start, GET with auth → 200 ---
    var r0_11c = await request('GET', inst.base, '/api/admin/library/test-asset-1/full', null, AUTH_HEADERS);
    var assetOk = r0_11c.status === 200 && Buffer.isBuffer(r0_11c.raw) && r0_11c.raw.length === imgBuf.length;
    t('R0_11_LIBRARY_FULL_REAL_ASSET_200', assetOk, 'status=' + r0_11c.status + ' len=' + (r0_11c.raw ? r0_11c.raw.length : '?'));

    // --- R0_12: GET /api/frame.bin returns 200 with EPF1 magic and 192010 bytes ---
    var r0_12 = await request('GET', inst.base, '/api/frame.bin');
    var r0_12_ok = r0_12.status === 200 && Buffer.isBuffer(r0_12.raw) && r0_12.raw.length === 192010 &&
      r0_12.raw.slice(0, 4).toString('ascii') === 'EPF1';
    t('R0_12_FRAME_BIN_EPF1', r0_12_ok, 'status=' + r0_12.status + ' len=' + (r0_12.raw ? r0_12.raw.length : '?') +
      ' magic=' + (r0_12.raw ? r0_12.raw.slice(0, 4).toString('ascii') : '?'));

    // --- R0_13: PATCH /api/admin/library/test-id with wrong auth returns 403 ---
    var r0_13 = await request('PATCH', inst.base, '/api/admin/library/test-id', { metadata: { title: 'x' } });
    t('R0_13_PATCH_WRONG_AUTH_403', r0_13.status === 403, 'status=' + r0_13.status +
      ' body=' + (typeof r0_13.body === 'object' ? JSON.stringify(r0_13.body) : String(r0_13.body).slice(0, 60)));

    // --- R0_14: DELETE /api/admin/library/test-id with correct auth and origin returns 503 FEATURE_DISABLED ---
    var r0_14 = await request('DELETE', inst.base, '/api/admin/library/test-id', { reason: 'UNSAFE' }, ORIGIN_HEADERS);
    var r0_14_ok = r0_14.status === 503 && typeof r0_14.body === 'object' && r0_14.body.error &&
      r0_14.body.error.indexOf('FEATURE_DISABLED') >= 0;
    t('R0_14_DELETE_FEATURE_DISABLED', r0_14_ok, 'status=' + r0_14.status +
      (typeof r0_14.body === 'object' ? ' error=' + (r0_14.body.error || '') : ''));

  } finally {
    await stopSrv(inst);
  }

  var afterHashes = captureTrackedHashes();
  var changed = compareHashes(beforeHashes, afterHashes);
  t('R0_15_NO_POLLUTION', changed.length === 0, changed.length ? 'changed: ' + changed.join(',') : 'clean');

  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}

  console.log('\n=== R0 HTTP Behavior: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

main().catch(function (e) {
  console.error('ERROR:', e.message);
  if (inst) { stopSrv(inst).catch(function(){}); inst = null; }
  if (dataDir) { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (ex) {} dataDir = null; }
  console.log('\n=== R0 HTTP Behavior: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(1);
});
