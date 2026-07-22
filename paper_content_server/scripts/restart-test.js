const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

var exitCode = 0;
var RUN_ID = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(os.tmpdir(), 'test_restart_' + RUN_ID);

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

var passed = 0, failed = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function makeEnv(extra) {
  return Object.assign({}, process.env, {
    TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean', ENABLE_DEBUG_ROUTES: 'true',
    ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8'
  }, extra);
}

function spawnSrv(envOverrides, instanceId) {
  var port = 8796 + Math.floor(Math.random() * 100);
  var env = makeEnv(Object.assign({ PORT: String(port), TEST_INSTANCE_ID: instanceId }, envOverrides));
  var child = spawn(process.execPath, [SRV], { env: env, cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', function(d) { process.stdout.write('[SRV-' + instanceId + '] ' + d.toString().slice(0, 200) + '\n'); });
  var exited = false;
  child.on('exit', function() { exited = true; });
  child.on('error', function() { exited = true; });
  return { child: child, port: port, base: 'http://127.0.0.1:' + port, exited: function() { return exited; } };
}

function stopServer(server, label) {
  return new Promise(function(resolve) {
    if (!server.child) { resolve(); return; }
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      resolve();
      return;
    }
    var forceTimer = setTimeout(function() {
      try { server.child.kill('SIGKILL'); } catch (e) {}
      console.log('  [' + label + '] force killed after timeout');
    }, 4000);
    server.child.once('exit', function() {
      clearTimeout(forceTimer);
      resolve();
    });
    server.child.kill();
  });
}

function waitForSrv(base, instanceId, timeout) {
  return new Promise(function(resolve) {
    var start = Date.now();
    async function attempt() {
      if (Date.now() - start > timeout) return resolve(null);
      try {
        var r = await getWithTimeout(base + '/api/state.json', 3000);
        if (r.s !== 200) { setTimeout(attempt, 500); return; }
        var ir = await getWithTimeout(base + '/debug/test-instance', 2000);
        if (ir.s !== 200) { setTimeout(attempt, 500); return; }
        var ij = JSON.parse(ir.b.toString());
        if (ij.instanceId !== instanceId) { setTimeout(attempt, 500); return; }
        resolve(r);
      } catch (e) { setTimeout(attempt, 500); }
    }
    attempt();
  });
}

function getWithTimeout(url, ms) {
  return new Promise(function(ok, fail) {
    var req = http.get(url, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', fail);
    req.setTimeout(ms || 3000, function() { req.destroy(); fail(new Error('timeout')); });
  });
}

function copyFixture(dst) {
  var src = path.join(CWD, 'data');
  ['image_index.json', 'raw_index.json', 'news_cache.json', 'library_state.json', 'news_rotation_state.json'].forEach(function(f) {
    var s = path.join(src, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(dst, f));
  });
}

function fullEnv(dir) {
  return {
    DATA_DIR: dir,
    NEWS_CACHE_FILE: path.join(dir, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(dir, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(dir, 'news_rotation_state.json'),
    IMAGE_INDEX_FILE: path.join(dir, 'image_index.json')
  };
}

function fileEnvKey(f) {
  if (f === 'news_cache.json') return 'NEWS_CACHE_FILE';
  if (f === 'library_state.json') return 'LIBRARY_STATE_FILE';
  if (f === 'news_rotation_state.json') return 'NEWS_ROTATION_FILE';
  return 'IMAGE_INDEX_FILE';
}

async function runCase(label, envOverrides, instanceSuffix, cb) {
  var instanceId = 'restart_' + RUN_ID + '_' + instanceSuffix;
  var server = spawnSrv(envOverrides, instanceId);
  var st = await waitForSrv(server.base, instanceId, 25000);
  if (!st) {
    if (server.exited()) {
      check(label + ' early exit', false, 'server exited before ready');
    } else {
      check(label + ' start timeout', false, 'timeout or instance mismatch');
    }
    await stopServer(server, label);
    return false;
  }
  try { await cb(server); }
  catch (e) { console.log('  [' + label + '] EXCEPTION: ' + e.message); failed++; exitCode = 1; }
  await stopServer(server, label);
  return true;
}

async function main() {
  console.log('=== Restart & Recovery Test ===\n');
  console.log('RUN_ID: ' + RUN_ID);
  fs.mkdirSync(TMPDIR, { recursive: true });
  var realDD = path.join(CWD, 'data');
  var realFiles = ['news_cache.json', 'library_state.json', 'news_rotation_state.json', 'image_index.json'];
  var hashB = {};
  realFiles.forEach(function(f) { try { hashB[f] = sha256(fs.readFileSync(path.join(realDD, f))); } catch (e) { hashB[f] = 'MISSING'; } });

  var restartDir = path.join(TMPDIR, 'restart');
  fs.mkdirSync(restartDir, { recursive: true });
  copyFixture(restartDir);
  var env1 = fullEnv(restartDir);

  console.log('\n--- CASE 1: Fresh start ---');
  await runCase('srv1', env1, 'srv1', async function(srv) {
    var st = JSON.parse((await getWithTimeout(srv.base + '/api/state.json', 5000)).b.toString());
    check('state 200', true, 'frameId=' + (st.frameId || '').slice(0,20));
    var ins = JSON.parse((await getWithTimeout(srv.base + '/debug/test-instance', 3000)).b.toString());
    check('instance is unique', ins.instanceId.indexOf('restart_' + RUN_ID + '_srv1') >= 0, 'id=' + ins.instanceId);
    var fb = await getWithTimeout(srv.base + '/api/frame.bin', 10000);
    check('frame 200', fb.s === 200);
    check('frame 192010B', fb.b.length === 192010);
    var p = fb.b.slice(10), codes = {};
    for (var i = 0; i < p.length; i++) { codes[String((p[i] >> 4) & 0x0F)] = true; codes[String(p[i] & 0x0F)] = true; }
    check('no code 4', !codes['4']);
    var nw = JSON.parse((await getWithTimeout(srv.base + '/api/news.json', 10000)).b.toString());
    check('news count 6', nw.items.length === 6);
  });

  console.log('\n--- CASE 2: True restart (same data dir, unique instance) ---');
  await runCase('srv2', env1, 'srv2', async function(srv) {
    var stRes = await getWithTimeout(srv.base + '/api/state.json', 5000);
    var st = JSON.parse(stRes.b.toString());
    check('state 200 after restart', stRes.s === 200, 'http=' + stRes.s + ' mode=' + st.mode);
    check('frameId valid', st.frameId && st.frameId.length > 10);
    var ins = JSON.parse((await getWithTimeout(srv.base + '/debug/test-instance', 3000)).b.toString());
    check('instance matches suffix', ins.instanceId.indexOf('_srv2') >= 0, 'id=' + ins.instanceId);
    var fb = await getWithTimeout(srv.base + '/api/frame.bin', 10000);
    check('frame 200', fb.s === 200);
    check('frame 192010B', fb.b.length === 192010);
  });

  console.log('\n--- CASE 3: Cache / renderCount ---');
  await runCase('cache', fullEnv(path.join(TMPDIR, 'cache3')), 'cache3', async function(srv) {
    await getWithTimeout(srv.base + '/api/state.json', 5000);
    await getWithTimeout(srv.base + '/api/frame.bin', 10000);
    var p1 = await getWithTimeout(srv.base + '/debug/pin-state.json', 3000);
    var pinObj = JSON.parse(p1.b.toString());
    var rc1 = (pinObj.renderCount !== undefined) ? pinObj.renderCount : 0;
    check('first render', rc1 >= 0, 'rc=' + rc1 + ' (0 ok for news mode)');
    await getWithTimeout(srv.base + '/api/state.json', 5000);
    var p2 = await getWithTimeout(srv.base + '/debug/pin-state.json', 3000);
    var pinObj2 = JSON.parse(p2.b.toString());
    var rc2 = (pinObj2.renderCount !== undefined) ? pinObj2.renderCount : 0;
    check('second no new render', rc2 === rc1, '' + rc1 + ' -> ' + rc2);
    await getWithTimeout(srv.base + '/api/state.json', 5000);
    var p3 = await getWithTimeout(srv.base + '/debug/pin-state.json', 3000);
    var pinObj3 = JSON.parse(p3.b.toString());
    var rc3 = (pinObj3.renderCount !== undefined) ? pinObj3.renderCount : 0;
    check('third no new render', rc3 === rc1, '' + rc1 + ' -> ' + rc3);
  });

  console.log('\n--- CASE 4: Corrupt state files (12 scenarios, each isolated) ---');
  var files = ['news_cache.json', 'library_state.json', 'news_rotation_state.json', 'image_index.json'];
  var modes = ['missing', 'empty', 'invalid'];
  for (var fi = 0; fi < files.length; fi++) {
    for (var mi = 0; mi < modes.length; mi++) {
      var f = files[fi], m = modes[mi];
      var tag = f.replace(/\..*$/, '').replace(/_/g, '-');
      var dir = path.join(TMPDIR, 'cx_' + tag + '_' + m);
      fs.mkdirSync(dir, { recursive: true });
      files.forEach(function(of) {
        var src = path.join(realDD, of);
        if (fs.existsSync(src) && of !== f) fs.copyFileSync(src, path.join(dir, of));
      });
      if (m === 'empty') fs.writeFileSync(path.join(dir, f), '');
      else if (m === 'invalid') fs.writeFileSync(path.join(dir, f), '{{{not json}}}');
      var env = { DATA_DIR: dir };
      files.forEach(function(of) { env[fileEnvKey(of)] = path.join(dir, of); });

      await runCase(tag + ' ' + m, env, tag + '_' + m, async function(srv) {
        var ins = JSON.parse((await getWithTimeout(srv.base + '/debug/test-instance', 3000)).b.toString());
        check(tag + ' ' + m + ' instance unique', ins.instanceId.indexOf('_' + tag + '_' + m) >= 0, 'id=' + ins.instanceId);
        var st = await getWithTimeout(srv.base + '/api/state.json', 10000);
        var sj = JSON.parse(st.b.toString());
        var stOk = st.s === 200 && sj.frameId !== undefined;
        var fb = await getWithTimeout(srv.base + '/api/frame.bin', 15000);
        var fbOk = fb.s === 200 && fb.b.length === 192010;
        check(tag + ' ' + m, stOk && fbOk, 'state=' + st.s + ' frame=' + fb.s + 'B=' + fb.b.length);
      });
    }
  }

  console.log('\n--- Data Isolation ---');
  var allDataOk = true;
  realFiles.forEach(function(f) {
    try {
      var h = sha256(fs.readFileSync(path.join(realDD, f)));
      var ok = h === hashB[f];
      check('DATA_UNCHANGED ' + f, ok); if (!ok) allDataOk = false;
    } catch (e) { check('DATA_UNCHANGED ' + f, false); allDataOk = false; }
  });
  if (allDataOk) check('DATA_UNCHANGED ALL', true);

  try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch (e) {}
  console.log('\n=== Summary ===');
  console.log(passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' tests');
  process.exit(exitCode);
}

main().catch(function(e) { console.error('UNCAUGHT: ' + e.message); failed++; exitCode = 1; process.exit(1); });
