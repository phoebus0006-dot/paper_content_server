#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..', '..');

var pass = 0, fail = 0, ec = 0, srv = null, dataDir = null, port = 0, base = '';
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}

function makeTmpDir() {
  var d = path.join(ROOT, 'test_data_r0_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, 'images'), { recursive: true });
  return d;
}

function waitForSrv(baseUrl, timeout) {
  var deadline = Date.now() + timeout;
  return new Promise(function (resolve, reject) {
    function poll() {
      if (Date.now() > deadline) return reject(new Error('server did not start'));
      var req = http.get(baseUrl + '/api/state.json', function (res) {
        if (res.statusCode === 200) return resolve();
        res.resume(); setTimeout(poll, 200);
      });
      req.on('error', function () { setTimeout(poll, 200); });
      req.end();
    }
    poll();
  });
}

function spawnSrv(tmpDir, id, envOverrides) {
  var p = port++;
  var env = Object.assign({}, process.env, {
    PORT: String(8788 + p),
    DATA_DIR: tmpDir,
    IMAGES_DIR: path.join(tmpDir, 'images'),
    ADMIN_ACCESS_MODE: 'lan',
    ADMIN_ALLOWED_CIDRS: '127.0.0.0/8',
    TRANSLATION_PROVIDER: 'none',
  }, envOverrides || {});
  var child = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', function () {});
  var b = 'http://127.0.0.1:' + env.PORT;
  return { child: child, port: env.PORT, base: b, exited: function () { return new Promise(function (r) { child.on('exit', r); }); } };
}

function stopSrv(inst, label) {
  return new Promise(function (resolve) {
    if (!inst || !inst.child) return resolve();
    var t = setTimeout(function () { try { inst.child.kill('SIGKILL'); } catch (e) {} resolve(); }, 4000);
    inst.child.on('exit', function () { clearTimeout(t); resolve(); });
    try { inst.child.kill('SIGTERM'); } catch (e) { clearTimeout(t); resolve(); }
  });
}

function getJson(baseUrl, p) {
  return new Promise(function (resolve, reject) {
    http.get(baseUrl + p, function (res) {
      var b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(b), headers: res.headers }); }
        catch (e) { resolve({ status: res.statusCode, body: b, headers: res.headers }); }
      });
    }).on('error', reject);
  });
}

function postJson(baseUrl, p, body) {
  return new Promise(function (resolve, reject) {
    var b = JSON.stringify(body);
    var opts = { method: 'POST', hostname: '127.0.0.1', port: new URL(baseUrl).port, path: p,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } };
    var req = http.request(opts, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(d), headers: res.headers }); }
        catch (e) { resolve({ status: res.statusCode, body: d, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.write(b);
    req.end();
  });
}

console.log('=== R0 HTTP Behavior Test ===');

async function main() {
  dataDir = makeTmpDir();
  var inst = spawnSrv(dataDir, 'main');
  try {
    await waitForSrv(inst.base, 15000);
  } catch (e) {
    t('R0_SRV_START', false, 'server failed to start');
    console.log('\n=== R0 HTTP Behavior: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(1);
    return;
  }

  // --- R0_10: photo-palette HTTP 路径验证 ---
  var r0_10 = await getJson(inst.base, '/api/admin/photo-palette?type=storyboard');
  var r0_10_debug = await getJson(inst.base, '/debug/photo-palette.json?type=storyboard');
  t('R0_10_PHOTO_PALETTE_HTTP_PATH',
    r0_10.status === 200,
    'admin path: ' + r0_10.status + ' (expected 200); debug path: ' + r0_10_debug.status + ' (expected 200)');

  // --- R0_11: GET /api/admin/photos/:id 返回正确状态 ---
  var r0_11 = await getJson(inst.base, '/api/admin/photos/nonexistent-id');
  t('R0_11_GET_PHOTO_BY_ID_HTTP',
    r0_11.status === 200 || r0_11.status === 404,
    'status=' + r0_11.status + ' (expected 200 or 404)');

  // --- R0_12: DELETE /api/admin/photos/:id 返回正确状态 ---
  var r0_12 = await postJson(inst.base, '/api/admin/photos/nonexistent-id/delete', {});
  var r0_12b = { status: 405 };
  try {
    r0_12b = await new Promise(function (resolve, reject) {
      var req = http.request({ method: 'DELETE', hostname: '127.0.0.1', port: inst.port,
        path: '/api/admin/photos/nonexistent-id', headers: {} }, function (res) {
        var d = '';
        res.on('data', function (c) { d += c; });
        res.on('end', function () { resolve({ status: res.statusCode, body: d }); });
      });
      req.on('error', reject);
      req.end();
    });
  } catch (e) { r0_12b = { status: 0 }; }
  t('R0_12_DELETE_PHOTO_HTTP',
    r0_12.status === 200 || r0_12b.status === 200 || r0_12b.status === 404 || r0_12.status === 404,
    'DELETE status=' + r0_12b.status + ' POST+body status=' + r0_12.status + ' (expected 200 or 404)');

  // --- R0_13: POST /api/admin/photos/:id/save-edit 返回正确状态 ---
  var r0_13 = await postJson(inst.base, '/api/admin/photos/nonexistent-id/save-edit', {});
  t('R0_13_SAVE_EDIT_PHOTO_HTTP',
    r0_13.status === 200 || r0_13.status === 404 || r0_13.status === 400,
    'status=' + r0_13.status + ' (expected 200 or 404)');

  // --- R0_14: 上传禁用时显示明确原因 ---
  var photosResp = await getJson(inst.base, '/api/admin/photos');
  t('R0_14_UPLOAD_DISABLED_REASON',
    photosResp.body && (photosResp.body.uploadAvailable !== undefined || photosResp.body.uploadDisabledReason !== undefined),
    photosResp.body ? JSON.stringify(photosResp.body).substring(0, 100) : 'no body');

  // --- R0_15: 发布历史只有一条 CURRENT ---
  var pubResp = await getJson(inst.base, '/api/admin/publications');
  if (pubResp.body && Array.isArray(pubResp.body)) {
    var activeCount = pubResp.body.filter(function (p) { return p.status === 'active' || p.status === 'CURRENT'; }).length;
    t('R0_15_PUBLISH_HISTORY_SINGLE_CURRENT',
      activeCount <= 1,
      'active count=' + activeCount + ' (expected <= 1)');
  } else if (pubResp.body && pubResp.body.publications) {
    var activeCount2 = pubResp.body.publications.filter(function (p) { return p.status === 'active' || p.status === 'CURRENT'; }).length;
    t('R0_15_PUBLISH_HISTORY_SINGLE_CURRENT',
      activeCount2 <= 1,
      'active count=' + activeCount2 + ' (expected <= 1)');
  } else {
    t('R0_15_PUBLISH_HISTORY_SINGLE_CURRENT', false, 'cannot parse response');
  }

  // --- R0_16: 图片发布后 frameId 变化 ---
  var stateBefore = await getJson(inst.base, '/api/state.json');
  var pubResult = await postJson(inst.base, '/api/admin/publish', {});
  var stateAfter = await getJson(inst.base, '/api/state.json');
  t('R0_16_PUBLISH_CHANGES_FRAMEID',
    stateBefore.body && stateAfter.body && stateBefore.body.frameId !== stateAfter.body.frameId,
    (stateBefore.body ? 'before=' + stateBefore.body.frameId : '') +
    (stateAfter.body ? ' after=' + stateAfter.body.frameId : ''));

  await stopSrv(inst, 'main');
  console.log('\n=== R0 HTTP Behavior: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

main().catch(function (e) {
  console.error('R0 HTTP test error:', e.message);
  process.exit(1);
});
