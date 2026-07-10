const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

var exitCode = 0;
var PORT = 8789 + Math.floor(Math.random() * 10);
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(CWD, 'test_admin_' + Date.now());
var TOKEN = 'test-admin-token-abc123';
var passed = 0, failed = 0;

function get(url, token) {
  return new Promise(function(ok, fail) {
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    http.get(opts, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
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
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', fail);
    req.end(j);
  });
}

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
    ADMIN_TOKEN: TOKEN, DATA_DIR: TMPDIR
  });

  var server = spawn(process.execPath, [SRV], { env: env, cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
  var hasCrash = false;
  server.stderr.on('data', function(d) { process.stdout.write('[SRV] ' + d.toString().slice(0, 200) + '\n'); });

  var ready = false;
  for (var i = 0; i < 60; i++) {
    try { var r = await get('/api/state.json'); if (r.s === 200) { ready = true; break; } } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
  if (!ready) { console.log('FAIL: server did not start'); server.kill(); process.exit(1); }
  console.log('Server ready\n');

  try {
    var r1 = await get('/api/admin/dashboard');
    check('no token returns 401', r1.s === 401, 'got ' + r1.s);

    var r2 = await get('/api/admin/dashboard', 'wrong-token');
    check('wrong token returns 403', r2.s === 403, 'got ' + r2.s);

    var r3 = await get('/api/admin/dashboard', TOKEN);
    check('correct token returns 200', r3.s === 200, 'got ' + r3.s);
    var dj = JSON.parse(r3.b.toString());
    check('dashboard has status ok', dj.status === 'ok', dj.status);

    var r4 = await post('/api/admin/news/draft', { items: [{ source: 'Test', title: 'Title', summary: 'Summary text for testing purposes that is long enough.', url: 'http://test.com' }] }, TOKEN);
    check('save draft returns 200', r4.s === 200, 'got ' + r4.s);

    var r5 = await post('/api/admin/publish/news', {}, TOKEN);
    check('publish news 200', r5.s === 200, 'got ' + r5.s);

    var r6 = await post('/api/admin/publish/photo', { photoId: 'test123' }, TOKEN);
    check('publish photo 200', r6.s === 200, 'got ' + r6.s);

    var r7 = await get('/api/admin/publish-history', TOKEN);
    check('publish history 200', r7.s === 200, 'got ' + r7.s);

    var r8 = await get('/api/admin/photos', TOKEN);
    check('photo list 200', r8.s === 200, 'got ' + r8.s);

    var r9 = await post('/api/admin/rollback', { publishId: 'test' }, TOKEN);
    check('rollback 200', r9.s === 200, 'got ' + r9.s);

    var r10 = await get('/admin/');
    check('admin page 200', r10.s === 200, 'got ' + r10.s);

    var r11 = await get('/admin/admin.css');
    check('admin CSS 200', r11.s === 200, 'got ' + r11.s);

    var r12 = await get('/admin/admin.js');
    check('admin JS 200', r12.s === 200, 'got ' + r12.s);

  } catch(e) {
    console.log('ERROR: ' + e.message);
    failed++; exitCode = 1;
  }

  server.kill();
  await new Promise(function(r) { server.on('exit', r); setTimeout(r, 1000); });
  try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(exitCode);
}

main().catch(function(e) { console.error('UNCAUGHT: ' + e.message); process.exit(1); });
