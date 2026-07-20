var http = require('http');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..', '..');
var PORT = 8891;
var BASE = 'http://127.0.0.1:' + PORT;
var TMPDIR = path.join(ROOT, 'test_lan_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;
function check(label, cond) { if (cond) { passed++; console.log('PASS', label) } else { failed++; exitCode = 1; console.log('FAIL', label) } }
function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url }, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    }).on('error', function(e) { ok({ s: 0, b: null, err: e }); });
  });
}
function post(url, body, origin) {
  return new Promise(function(ok) {
    var j = JSON.stringify(body); var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(j) } };
    if (origin) { opts.headers['origin'] = origin; opts.headers['referer'] = origin + '/admin/'; }
    var r = http.request(opts, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); });
    r.end(j); r.on('error', function(e) { ok({ s: 0, b: null, err: e }); });
  });
}
async function waitForServer() {
  for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); }
  return false;
}
async function main() {
  console.log('=== Admin LAN Direct Access Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitForServer()) { console.log('FAIL: server did not start'); server.kill(); process.exit(1); }
  var r1 = await get('/admin/'); check('LAN_ADMIN_PAGE_NO_TOKEN=200', r1.s === 200);
  var html = r1.b ? r1.b.toString() : ''; check('LAN_HTML_HAS_NO_LOGIN_OVERLAY', html.indexOf('login-overlay') === -1); check('LAN_HTML_HAS_NO_ADMIN_TOKEN_TEXT', html.indexOf('ADMIN_TOKEN') === -1);
  var r2 = await get('/api/admin/dashboard'); check('LAN_ADMIN_API_NO_TOKEN=200', r2.s === 200);
  var r3 = await get('/api/admin/news'); check('LAN_ADMIN_NEWS_NO_TOKEN=200', r3.s === 200);
  var r4 = await get('/api/admin/photos'); check('LAN_ADMIN_PHOTOS_NO_TOKEN=200', r4.s === 200);
  var r5 = await get('/api/admin/publish-history'); check('LAN_ADMIN_HISTORY_NO_TOKEN=200', r5.s === 200);
  var r6 = await post('/api/admin/news/draft', { items: [] }, 'http://127.0.0.1:' + PORT); check('LAN_WRITE_SAME_ORIGIN=200', r6.s === 400 || r6.s === 200);
  var r7 = await get('/api/state.json'); check('STATE_JSON=200', r7.s === 200);
  var r8 = await get('/api/frame.bin'); check('FRAME_BIN', r8.s === 200 || r8.s === 503);
  var r9 = await get('/api/news.json'); check('NEWS_JSON=200', r9.s === 200);
  var r10 = await get('/health/live'); check('HEALTH_LIVE=200', r10.s === 200);
  var r11 = await get('/api/admin/access-mode'); check('ACCESS_MODE_ENDPOINT=200', r11.s === 200);
  if (r11.s === 200) { check('ACCESS_MODE_IS_LAN', JSON.parse(r11.b.toString()).mode === 'lan'); }
  check('NO_CORS_WILDCARD', !r1.h['access-control-allow-origin']);
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  server.kill(); try { rmDir(TMPDIR); } catch(e) {} process.exit(exitCode);
}
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
main().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
