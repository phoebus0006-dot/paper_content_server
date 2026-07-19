const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

var exitCode = 0;
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(CWD, 'test_admin_' + Date.now());
var PORT = 8793;
var BASE = 'http://127.0.0.1:' + PORT;
var TOKEN = 'test-admin-token-abc123';
var passed = 0, failed = 0;

function get(url, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    http.get(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    }).on('error', fail);
  });
}

function post(url, body, token) {
  return new Promise(function(ok, fail) {
    var j = JSON.stringify(body);
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(j) } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    var req = http.request(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    });
    req.on('error', fail);
    req.end(j);
  });
}

function del(url, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'DELETE', headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    var req = http.request(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', fail);
    req.end();
  });
}

function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function makeItem(i) {
  return { source: 'Test', category: 'technology', title: 'Title' + i, summary: 'Test summary item ' + i + '. Long enough for validation.', url: 'http://test' + i + '.com' };
}

var sixItems = [];
for (var gi = 0; gi < 6; gi++) sixItems.push(makeItem(gi + 1));

function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

async function main() {
  console.log('=== Admin Workflow Test ===\n');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var dataSrc = path.join(CWD, 'data');
  ['image_index.json', 'raw_index.json', 'news_cache.json', 'library_state.json', 'news_rotation_state.json'].forEach(function(f) {
    var src = path.join(dataSrc, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TMPDIR, f));
  });

  var env = Object.assign({}, process.env, {
    PORT: String(PORT), TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean', ENABLE_DEBUG_ROUTES: 'true',
    ADMIN_TOKEN: TOKEN, DATA_DIR: TMPDIR,
    NEWS_CACHE_FILE: path.join(TMPDIR, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(TMPDIR, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(TMPDIR, 'news_rotation_state.json'),
    IMAGE_INDEX_FILE: path.join(TMPDIR, 'image_index.json')
  });

  var server = spawn(process.execPath, [SRV], { env: env, cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
  // 转发 server stdout/stderr 到测试输出，否则 publish/news 500 等错误被静默吞掉，无法定位根因。
  server.stdout.on('data', function(d) { process.stdout.write('[server] ' + d); });
  server.stderr.on('data', function(d) { process.stderr.write('[server] ' + d); });
  var ready = false;
  for (var i = 0; i < 60; i++) {
    try { var r = await get('/api/state.json'); if (r.s === 200) { ready = true; break; } } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
  if (!ready) { console.log('FAIL: server did not start'); server.kill(); process.exit(1); }

  try {
    console.log('--- AUTH ---');
    check('no token -> 401', (await get('/api/admin/dashboard')).s === 401);
    check('wrong token -> 403', (await get('/api/admin/dashboard', 'wrong')).s === 403);
    check('valid token -> 200', (await get('/api/admin/dashboard', TOKEN)).s === 200);

    console.log('\n--- NEWS DRAFT ---');
    check('1 item -> 400', (await post('/api/admin/news/draft', { items: [makeItem(1)] }, TOKEN)).s >= 400);
    check('valid 6 -> 200', (await post('/api/admin/news/draft', { items: sixItems }, TOKEN)).s === 200);

    console.log('\n--- NEWS PUBLISH ---');
    var pubN = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish 200', pubN.s === 200);
    var pubNd = JSON.parse(pubN.b.toString());
    check('has frameId', pubNd.frameId && pubNd.frameId.length > 5);
    // frameId 现在是真实 snap.frameId（与 /api/state.json 一致），
    // 不再是临时生成的 'manual-news:xxx' 前缀。
    check('has snapshotId', pubNd.snapshotId && pubNd.snapshotId.length > 5);

    var fb = await get(BASE + '/api/frame.bin');
    check('frame 200', fb.s === 200);
    check('frame 192010B', fb.b.length === 192010);
    var pl = fb.b.slice(10);
    var seenCodes = {}, code4 = 0;
    for (var pi = 0; pi < 100; pi++) {
      var hi = (pl[pi] >> 4) & 0x0F, lo = pl[pi] & 0x0F;
      seenCodes[String(hi)] = true; seenCodes[String(lo)] = true;
      if (hi === 4) code4++; if (lo === 4) code4++;
    }
    var allValid = Object.keys(seenCodes).every(function(c) { return ['0','1','2','3','5','6'].indexOf(c) >= 0; });
    check('sample codes valid', allValid && code4 === 0, 'codes=' + Object.keys(seenCodes).join(',') + ' c4=' + code4);

    console.log('\n--- PHOTO ---');
    check('unknown photo', (await post('/api/admin/publish/photo', { photoId: 'nonexistent' }, TOKEN)).s >= 400);

    console.log('\n--- OVERRIDE ---');
    check('clear override', (await del(BASE + '/api/admin/override', TOKEN)).s < 300);

    console.log('\n--- ADMIN PAGES ---');
    check('admin page', (await get('/admin/', TOKEN)).s === 200);
    check('admin CSS', (await get('/admin/admin.css', TOKEN)).s === 200);
    check('admin JS', (await get('/admin/admin.js', TOKEN)).s === 200);

    console.log('\n--- DATA ---');
    ['news_cache.json','library_state.json','news_rotation_state.json','image_index.json'].forEach(function(f) {
      check('DATA ' + f, fs.existsSync(path.join(CWD, 'data', f)));
    });

  } catch(e) { console.log('ERROR:', e.message); failed++; exitCode = 1; }

  server.kill();
  await new Promise(function(r) { server.on('exit', r); setTimeout(r, 1000); });
  try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(exitCode);
}

main().catch(function(e) { console.error('UNCAUGHT:', e.message); process.exit(1); });
