const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

var exitCode = 0;
var BASE = 'http://127.0.0.1:8796';
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(CWD, 'test_restart_' + Date.now());

function get(url) {
  return new Promise(function(ok, fail) {
    http.get(url, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    }).on('error', fail);
  });
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

var passed = 0, failed = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function makeEnv(extra) {
  return Object.assign({}, process.env, {
    PORT: '8796', TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean', ENABLE_DEBUG_ROUTES: 'true'
  }, extra);
}

function spawnSrv(envOverrides) {
  return spawn(process.execPath, [SRV], { env: makeEnv(envOverrides), cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
}

function waitForSrv(timeout) {
  return new Promise(function(resolve) {
    var start = Date.now();
    function attempt() {
      if (Date.now() - start > timeout) return resolve(false);
      var req = http.get(BASE + '/api/state.json', function(r) { r.resume(); resolve(true); });
      req.on('error', function() { setTimeout(attempt, 1000); });
      req.setTimeout(2000, function() { req.destroy(); setTimeout(attempt, 1000); });
    }
    attempt();
  });
}

function fileEnvKey(f) {
  if (f === 'news_cache.json') return 'NEWS_CACHE_FILE';
  if (f === 'library_state.json') return 'LIBRARY_STATE_FILE';
  if (f === 'news_rotation_state.json') return 'NEWS_ROTATION_FILE';
  return 'IMAGE_INDEX_FILE';
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

async function runWith(env, cb) {
  var srv = spawnSrv(env);
  var ready = await waitForSrv(25000);
  if (!ready) { check('server start', false, 'timeout'); srv.kill(); exitCode = 1; failed++; await new Promise(function(r) { srv.on('exit', r); setTimeout(r, 1000); }); return false; }
  try {
    await cb(srv);
  } catch (e) {
    console.log('  EXCEPTION: ' + e.message);
    failed++; exitCode = 1;
  }
  srv.kill();
  await new Promise(function(r) { srv.on('exit', r); setTimeout(r, 1000); });
  return true;
}

async function main() {
  console.log('=== Restart & Recovery Test ===\n');
  fs.mkdirSync(TMPDIR, { recursive: true });
  var realDD = path.join(CWD, 'data');
  var realFiles = ['news_cache.json', 'library_state.json', 'news_rotation_state.json', 'image_index.json'];
  var hashB = {};
  realFiles.forEach(function(f) { try { hashB[f] = sha256(fs.readFileSync(path.join(realDD, f))); } catch (e) { hashB[f] = 'MISSING'; } });

  // ── CASE 1: Fresh start ──
  console.log('--- CASE 1: Fresh start ---');
  var restartDir = path.join(TMPDIR, 'restart');
  fs.mkdirSync(restartDir, { recursive: true });
  copyFixture(restartDir);
  var srv1Env = fullEnv(restartDir);

  await runWith(srv1Env, async function() {
    var st = await get(BASE + '/api/state.json');
    check('state 200', st.s === 200);
    var sj = JSON.parse(st.b.toString());
    check('valid frameId', sj.frameId && sj.frameId.length > 10);
    var fb = await get(BASE + '/api/frame.bin');
    check('frame 200', fb.s === 200);
    check('frame 192010B', fb.b.length === 192010);
    var p = fb.b.slice(10), codes = {};
    for (var i = 0; i < p.length; i++) { codes[String((p[i] >> 4) & 0x0F)] = true; codes[String(p[i] & 0x0F)] = true; }
    check('no code 4', !codes['4']);
    var nw = await get(BASE + '/api/news.json');
    check('news count 6', JSON.parse(nw.b.toString()).items.length === 6);
  });

  // ── CASE 2: True restart — same data dir, new process ──
  console.log('\n--- CASE 2: True restart (same data directory) ---');
  await runWith(srv1Env, async function() {
    var st = await get(BASE + '/api/state.json');
    check('state 200 after restart', st.s === 200);
    var sj = JSON.parse(st.b.toString());
    check('frameId valid', sj.frameId && sj.frameId.length > 10);
    var fb = await get(BASE + '/api/frame.bin');
    check('frame 200', fb.s === 200);
    check('frame 192010B', fb.b.length === 192010);
    var pl = await get(BASE + '/debug/photo-palette.json');
    if (pl.s === 200) check('code4 0', JSON.parse(pl.b.toString()).unsupportedCode4 === 0);
  });

  // ── CASE 3: Cache / renderCount ──
  console.log('\n--- CASE 3: Cache / renderCount ---');
  await runWith(fullEnv(path.join(TMPDIR, 'cache3')), async function() {
    await get(BASE + '/api/state.json');
    await get(BASE + '/api/frame.bin');
    var p1 = await get(BASE + '/debug/pin-state.json');
    var rc1 = JSON.parse(p1.b.toString()).renderCount;
    check('first render', rc1 >= 1, 'rc=' + rc1);
    await get(BASE + '/api/state.json');
    var rc2 = JSON.parse((await get(BASE + '/debug/pin-state.json')).b.toString()).renderCount;
    check('second no new render', rc2 === rc1, '' + rc1 + ' -> ' + rc2);
    await get(BASE + '/api/state.json');
    var rc3 = JSON.parse((await get(BASE + '/debug/pin-state.json')).b.toString()).renderCount;
    check('third no new render', rc3 === rc1, '' + rc1 + ' -> ' + rc3);
  });

  // ── CASE 4: 12 corrupt state file scenarios ──
  console.log('\n--- CASE 4: Corrupt state files (12 scenarios) ---');
  var files = ['news_cache.json', 'library_state.json', 'news_rotation_state.json', 'image_index.json'];
  var modes = ['missing', 'empty', 'invalid'];
  var allCorruptOk = true;
  for (var fi = 0; fi < files.length; fi++) {
    for (var mi = 0; mi < modes.length; mi++) {
      var f = files[fi];
      var m = modes[mi];
      var dir = path.join(TMPDIR, 'cx_' + f.replace(/\..*$/, '') + '_' + m);
      fs.mkdirSync(dir, { recursive: true });
      files.forEach(function(of) {
        var src = path.join(realDD, of);
        if (fs.existsSync(src) && of !== f) fs.copyFileSync(src, path.join(dir, of));
      });
      if (m === 'empty') { fs.writeFileSync(path.join(dir, f), ''); }
      else if (m === 'invalid') { fs.writeFileSync(path.join(dir, f), '{{{not json}}}'); }
      // missing: do not create file

      var env = { DATA_DIR: dir };
      files.forEach(function(of) { env[fileEnvKey(of)] = path.join(dir, of); });
      var label = f.replace(/\..*$/, '').replace(/_/g, '-') + ' ' + m;

      await runWith(env, async function() {
        var st = await get(BASE + '/api/state.json');
        var sj = JSON.parse(st.b.toString());
        var stOk = st.s === 200 && sj.frameId !== undefined;
        var fb = await get(BASE + '/api/frame.bin');
        var fbOk = fb.s === 200 && fb.b.length === 192010;
        var overall = stOk && fbOk;
        check(label, overall, 'state=' + st.s + ' frame=' + fb.s + 'B=' + fb.b.length);
      });
    }
  }

  // ── DATA ISOLATION ──
  console.log('\n--- Data Isolation ---');
  var allDataOk = true;
  realFiles.forEach(function(f) {
    try {
      var h = sha256(fs.readFileSync(path.join(realDD, f)));
      var ok = h === hashB[f];
      check('DATA_UNCHANGED ' + f, ok);
      if (!ok) allDataOk = false;
    } catch (e) { check('DATA_UNCHANGED ' + f, false); allDataOk = false; }
  });
  if (allDataOk) check('DATA_UNCHANGED ALL', true);

  try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch (e) {}
  console.log('\n=== Summary ===');
  console.log(passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' tests');
  process.exit(exitCode);
}

main().catch(function(e) { console.error('UNCAUGHT: ' + e.message); failed++; exitCode = 1; process.exit(1); });
