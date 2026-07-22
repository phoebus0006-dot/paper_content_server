var http = require('http');
var crypto = require('crypto');
var net = require('net');
var { spawn } = require('child_process');
var path = require('path');
var fs = require('fs');
var os = require('os');

var exitCode = 0;
var passed = 0;
var failed = 0;
var RUN_ID = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(os.tmpdir(), 'legacy_restart_' + RUN_ID);
var DATA_DIR = path.join(CWD, 'data');
var TOKEN = 'legacy-admin-restart-token';
var _srv1 = null, _srv2 = null;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function trackedHashes() {
  var h = {};
  try {
    var files = require('child_process').execSync('git ls-files data/', { cwd: CWD, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    files.forEach(function(f) {
      var fp = path.join(DATA_DIR, f);
      try { h[f] = sha256(fs.readFileSync(fp)); } catch(e) { h[f] = null; }
    });
  } catch(e) {}
  return h;
}

function cleanup() {
  if (_srv1) { try { stopSrv(_srv1, 'srv1'); } catch(e) {} }
  if (_srv2) { try { stopSrv(_srv2, 'srv2'); } catch(e) {} }
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch(e) {}
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) { passed++; } else { failed++; exitCode = 1; }
}

function findFreePort() {
  return new Promise(function(ok, fail) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function() {
      var p = s.address().port;
      s.close(function() { ok(p); });
    });
    s.on('error', fail);
  });
}

function get(url, port, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: port, path: url, headers: {} };
    if (token) { opts.headers['Authorization'] = 'Bearer ' + token; }
    http.get(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    }).on('error', fail);
  });
}

function post(url, port, body, token) {
  return new Promise(function(ok, fail) {
    var j = JSON.stringify(body || {});
    var opts = { hostname: '127.0.0.1', port: port, path: url, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(j) } };
    if (token) { opts.headers['Authorization'] = 'Bearer ' + token; }
    var req = http.request(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', fail);
    req.end(j);
  });
}

function del(url, port, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: port, path: url, method: 'DELETE', headers: {} };
    if (token) { opts.headers['Authorization'] = 'Bearer ' + token; }
    var req = http.request(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', fail);
    req.end();
  });
}

function makeEnv(PORT, DATA_DIR, instanceId) {
  var env = Object.assign({}, process.env, {
    PORT: String(PORT),
    TZ: 'Europe/Paris',
    TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean',
    ENABLE_DEBUG_ROUTES: 'true',
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: TOKEN,
    TEST_INSTANCE_ID: instanceId,
    DATA_DIR: DATA_DIR,
    FEEDS_FILE: path.join(DATA_DIR, 'feeds.json'),
    NEWS_CACHE_FILE: path.join(DATA_DIR, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(DATA_DIR, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(DATA_DIR, 'news_rotation_state.json'),
    IMAGE_INDEX_FILE: path.join(DATA_DIR, 'image_index.json'),
    LAST_GOOD_NEWS_FILE: path.join(DATA_DIR, 'last_good_news.json'),
    FALLBACK_STUDY_DIR: path.join(DATA_DIR, 'fallback_study'),
    RAW_IMAGES_DIR: path.join(DATA_DIR, 'raw_images'),
    PROCESSED_IMAGES_DIR: path.join(DATA_DIR, 'processed_images'),
    IMPORT_IMAGES_DIR: path.join(DATA_DIR, 'import_images'),
    IMAGE_ROOT: path.join(DATA_DIR, 'images'),
  });
  return env;
}

function spawnSrv(PORT, DATA_DIR, instanceId) {
  var env = makeEnv(PORT, DATA_DIR, instanceId);
  var child = spawn(process.execPath, [SRV], { env: env, cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', function(d) {
    process.stdout.write('[SRV-' + instanceId + '] ' + d.toString().slice(0, 200) + '\n');
  });
  child.on('exit', function() {});
  child.on('error', function() {});
  return { child: child, port: PORT, instanceId: instanceId };
}

function waitForSrv(PORT, instanceId, timeout) {
  return new Promise(function(resolve) {
    var start = Date.now();
    function attempt() {
      if (Date.now() - start > timeout) { return resolve(null); }
      get('/api/state.json', PORT).then(function(r) {
        if (r.s !== 200) { setTimeout(attempt, 500); return; }
        get('/debug/test-instance', PORT).then(function(ir) {
          if (ir.s !== 200) { setTimeout(attempt, 500); return; }
          var ij = JSON.parse(ir.b.toString());
          if (ij.instanceId !== instanceId) { setTimeout(attempt, 500); return; }
          resolve(r);
        }).catch(function() { setTimeout(attempt, 500); });
      }).catch(function() { setTimeout(attempt, 500); });
    }
    attempt();
  });
}

function stopSrv(server, label) {
  return new Promise(function(resolve) {
    if (!server.child) { resolve(); return; }
    if (server.child.exitCode !== null || server.child.signalCode !== null) { resolve(); return; }
    var forceTimer = setTimeout(function() {
      try { server.child.kill('SIGKILL'); } catch (e) {}
      console.log('  [' + label + '] force killed');
    }, 8000);
    server.child.once('exit', function() {
      clearTimeout(forceTimer);
      resolve();
    });
    server.child.kill('SIGTERM');
  });
}

function makeItem(i) {
  return {
    source: 'Test',
    category: 'technology',
    title: 'Title' + i,
    summary: 'Test summary item ' + i + '. Must be long enough for validation checks.',
    url: 'http://test' + i + '.com',
  };
}

async function main() {
  var PORT = await findFreePort();
  var beforeHashes = trackedHashes();
  console.log('=== LEGACY_ADMIN_OVERRIDE Restart & Recovery Test ===\n');
  console.log('RUN_ID: ' + RUN_ID + ', PORT: ' + PORT);
  fs.mkdirSync(TMPDIR, { recursive: true });

  var instance1 = 'legacy1_' + RUN_ID;
  var instance2 = 'legacy2_' + RUN_ID;

  try {
    // ── Phase 1: Start server, publish manual news, capture state ──
    console.log('\n--- Phase 1: Start server and publish manual news ---');
    _srv1 = spawnSrv(PORT, TMPDIR, instance1);
    var st1 = await waitForSrv(PORT, instance1, 30000);
    if (!st1) { check('server1 healthy', false, 'timeout'); return; }
    check('server1 healthy', true);

    var sixItems = [];
    for (var gi = 0; gi < 6; gi++) { sixItems.push(makeItem(gi + 1)); }
    var draftRes = await post('/api/admin/news/draft', PORT, { items: sixItems }, TOKEN);
    check('draft 6 items -> 200', draftRes.s === 200, 's=' + draftRes.s);

    var approveRes = await post('/api/admin/news/draft/approve-all', PORT, {}, TOKEN);
    check('approve-all -> 200', approveRes.s === 200, 's=' + approveRes.s);

    var pubRes = await post('/api/admin/publish/news', PORT, {}, TOKEN);
    check('publish -> 200', pubRes.s === 200, 's=' + pubRes.s);
    var pubData = JSON.parse(pubRes.b.toString());
    check('publish snapshotId', typeof pubData.snapshotId === 'string' && pubData.snapshotId.length > 0, pubData.snapshotId);
    check('publish frameId', typeof pubData.frameId === 'string' && pubData.frameId.length > 0, pubData.frameId);
    check('publish frameSha256', typeof pubData.frameSha256 === 'string' && pubData.frameSha256.length > 0, pubData.frameSha256);

    var origSnapshotId = pubData.snapshotId;
    var origFrameId = pubData.frameId;
    var origSha256 = pubData.frameSha256;

    var s1 = await get('/api/state.json', PORT, TOKEN);
    check('state1 -> 200', s1.s === 200);
    var s1d = JSON.parse(s1.b.toString());
    check('state1 frameId matches', s1d.frameId === origFrameId, s1d.frameId);
    check('state1 snapshotId matches', s1d.snapshotId === origSnapshotId, s1d.snapshotId);
    check('state1 operatingMode LEGACY_ADMIN_OVERRIDE', s1d.operatingMode === 'LEGACY_ADMIN_OVERRIDE', s1d.operatingMode);
    check('state1 items length 6', s1d.items && s1d.items.length === 6);

    var f1 = await get('/api/frame.bin', PORT);
    check('frame1 -> 200', f1.s === 200);
    check('frame1 192010B', f1.b.length === 192010);
    check('frame1 SHA matches', sha256(f1.b) === origSha256);
    check('frame1 X-Frame-Id', f1.h && f1.h['x-frame-id'] === origFrameId);

    var origFrameBytes = f1.b;

    // ── Phase 2: Graceful shutdown ──
    console.log('\n--- Phase 2: Graceful shutdown ---');
    await stopSrv(_srv1, 'srv1');
    _srv1 = null;
    check('server1 stopped', true);

    await new Promise(function(r) { setTimeout(r, 500); });

    // ── Phase 3: Restart with same data dir ──
    console.log('\n--- Phase 3: Restart with same data dir ---');
    _srv2 = spawnSrv(PORT, TMPDIR, instance2);
    var st2 = await waitForSrv(PORT, instance2, 30000);
    if (!st2) { check('server2 healthy', false, 'timeout'); return; }
    check('server2 healthy', true);

    var s2 = await get('/api/state.json', PORT, TOKEN);
    check('state2 -> 200', s2.s === 200);
    var s2d = JSON.parse(s2.b.toString());
    check('state2 frameId restored', s2d.frameId === origFrameId, s2d.frameId);
    check('state2 snapshotId restored', s2d.snapshotId === origSnapshotId, s2d.snapshotId);
    check('state2 operatingMode LEGACY_ADMIN_OVERRIDE', s2d.operatingMode === 'LEGACY_ADMIN_OVERRIDE', s2d.operatingMode);
    check('state2 items length 6', s2d.items && s2d.items.length === 6);

    var f2 = await get('/api/frame.bin', PORT);
    check('frame2 -> 200', f2.s === 200);
    check('frame2 192010B', f2.b.length === 192010);
    check('frame2 SHA matches', sha256(f2.b) === origSha256);
    check('frame2 bytes identical', Buffer.isBuffer(f2.b) && Buffer.isBuffer(origFrameBytes) && f2.b.equals(origFrameBytes));
    check('frame2 X-Frame-Id', f2.h && f2.h['x-frame-id'] === origFrameId);

    // ── Phase 4: Clear override, verify AUTO ──
    console.log('\n--- Phase 4: Clear override and verify AUTO ---');
    var delRes = await del('/api/admin/override', PORT, TOKEN);
    check('DELETE override < 300', delRes.s < 300, 's=' + delRes.s);
    var delData = JSON.parse(delRes.b.toString());
    check('DELETE response operatingMode AUTO', delData.operatingMode === 'AUTO', delData.operatingMode);

    var s3 = await get('/api/state.json', PORT, TOKEN);
    check('state3 -> 200', s3.s === 200);
    var s3d = JSON.parse(s3.b.toString());
    check('state3 operatingMode AUTO', s3d.operatingMode === 'AUTO', s3d.operatingMode);
  } finally {
    // ── Cleanup ──
    console.log('\n--- Cleanup ---');
    cleanup();

    // ── Data integrity ──
    var afterHashes = trackedHashes();
    var polluted = [];
    Object.keys(afterHashes).forEach(function(f) {
      if (beforeHashes[f] !== afterHashes[f]) polluted.push(f);
    });
    if (polluted.length > 0) {
      check('DATA_INTEGRITY', false, 'changed: ' + polluted.join(', '));
    } else {
      check('DATA_INTEGRITY', true, 'clean');
    }
  }

  console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' ===');
  process.exit(exitCode);
}

main().catch(function(e) {
  console.error('UNCAUGHT: ' + e.message);
  failed++; exitCode = 1;
  process.exit(1);
});
