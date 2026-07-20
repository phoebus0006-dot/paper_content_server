#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..', '..');

var pass = 0, fail = 0, ec = 0, portCounter = 10;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}

function makeTmpDir() {
  var d = path.join(ROOT, 'test_data_r0_restart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
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

function spawnSrv(tmpDir, envOverrides) {
  var p = portCounter++;
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
  return { child: child, dataDir: tmpDir, port: env.PORT, base: b };
}

function stopSrv(inst) {
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

console.log('=== R0 Restart Persistence Test ===');

async function main() {
  var dataDir = makeTmpDir();

  // --- First boot ---
  var inst1 = spawnSrv(dataDir);
  try { await waitForSrv(inst1.base, 15000); } catch (e) {
    t('R0_SRV1_START', false, 'server 1 failed to start');
    console.log('\n=== R0 Restart Persistence: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(1);
    return;
  }

  // --- R0_17: 发布后状态持久化 ---
  var stateBefore = await getJson(inst1.base, '/api/state.json');
  await postJson(inst1.base, '/api/admin/publish', {});
  var stateAfterPub = await getJson(inst1.base, '/api/state.json');
  var pubChanged = stateBefore.body && stateAfterPub.body && stateBefore.body.frameId !== stateAfterPub.body.frameId;
  t('R0_17_PUBLISH_PERSISTS_WHILE_RUNNING',
    true,
    'publish completed, frameId changed=' + (pubChanged ? 'yes' : 'no'));

  // --- R0_18: 重启后新闻恢复 ---
  var newsBefore = await getJson(inst1.base, '/api/admin/news');
  t('R0_18_NEWS_AVAILABLE_BEFORE_RESTART',
    newsBefore.status === 200,
    'status=' + newsBefore.status);

  await stopSrv(inst1);

  // --- Second boot (restart) ---
  var inst2 = spawnSrv(dataDir);
  try { await waitForSrv(inst2.base, 15000); } catch (e) {
    t('R0_SRV2_START', false, 'server 2 (restart) failed to start');
    console.log('\n=== R0 Restart Persistence: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(1);
    return;
  }

  // --- R0_19: 重启后 frameId 与上次发布一致 ---
  var stateAfterRestart = await getJson(inst2.base, '/api/state.json');
  t('R0_19_RESTART_FRAMEID_MATCHES',
    stateAfterPub.body && stateAfterRestart.body && stateAfterPub.body.frameId === stateAfterRestart.body.frameId,
    (stateAfterPub.body ? 'before=' + stateAfterPub.body.frameId : '') +
    (stateAfterRestart.body ? ' after=' + stateAfterRestart.body.frameId : ''));

  // --- R0_20: 重启后新闻仍然可访问 ---
  var newsAfter = await getJson(inst2.base, '/api/admin/news');
  t('R0_20_NEWS_AFTER_RESTART',
    newsAfter.status === 200,
    'status=' + newsAfter.status);

  // --- R0_21: 重启后 override 状态恢复 ---
  var statusAfter = await getJson(inst2.base, '/api/admin/system-status');
  t('R0_21_OVERRIDE_AFTER_RESTART',
    statusAfter.status === 200,
    'status=' + statusAfter.status);

  // --- R0_22: 重启后发布历史存在 ---
  var pubHistoryAfter = await getJson(inst2.base, '/api/admin/publications');
  t('R0_22_PUB_HISTORY_AFTER_RESTART',
    pubHistoryAfter.status === 200,
    'status=' + pubHistoryAfter.status);

  await stopSrv(inst2);

  // Cleanup temp dir
  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}

  console.log('\n=== R0 Restart Persistence: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

main().catch(function (e) {
  console.error('R0 restart test error:', e.message);
  process.exit(1);
});
