var http = require('http'); var path = require('path'); var fs = require('fs'); var os = require('os'); var net = require('net'); var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..'); var PORT; var TMPDIR = path.join(os.tmpdir(), 'test_ui_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url }, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); }).on('error', function(e) { ok({ s: 0, err: e }); });
  });
}
async function waitSrv() { for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); } return false; }
function findFreePort() {
  return new Promise(function(resolve, reject) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function() { var p = s.address().port; s.close(function() { resolve(p); }); });
    s.on('error', reject);
  });
}
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
async function main() {
  console.log('=== Admin UI No Login Test ===');
  var srv = null;
  try {
    fs.mkdirSync(TMPDIR, { recursive: true });
    PORT = await findFreePort();
    var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, FEEDS_FILE: path.join(TMPDIR, 'feeds.json'), NEWS_CACHE_FILE: path.join(TMPDIR, 'news_cache.json'), LIBRARY_STATE_FILE: path.join(TMPDIR, 'library_state.json'), NEWS_ROTATION_FILE: path.join(TMPDIR, 'news_rotation_state.json'), IMAGE_INDEX_FILE: path.join(TMPDIR, 'image_index.json'), LAST_GOOD_NEWS_FILE: path.join(TMPDIR, 'last_good_news.json'), TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
    srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!await waitSrv()) { console.log('FAIL: server did not start'); exitCode = 1; return; }
    var r1 = await get('/admin/'); check('LAN_ADMIN_200', r1.s === 200);
    var html = r1.b.toString();
    check('UI_LOGIN_OVERLAY_ABSENT_IN_LAN_MODE', html.indexOf('login-overlay') === -1 && html.indexOf('login-box') === -1);
    check('UI_ADMIN_TOKEN_TEXT_ABSENT_IN_LAN_MODE', html.indexOf('ADMIN_TOKEN') === -1);
    check('UI_APP_VISIBLE_IN_LAN_MODE', /id=["']?app["']?/.test(html));
    var js = (await get('/admin/admin.js')).b.toString();
    check('UI_JS_HAS_ACCESS_MODE_CHECK', js.indexOf('access-mode') > -1);
    check('UI_JS_TOKEN_INITIALIZED_NULL', js.indexOf('TOKEN=null') > -1);
    check('UI_JS_NO_HARDCODED_TOKEN', !/var\s+TOKEN\s*=\s*['"][^'"]+['"]/.test(js));
    check('PHOTO_UPLOAD_NO_HARDCODED_BEARER', js.indexOf('Authorization') === -1 || js.indexOf('Authorization') !== js.lastIndexOf('Authorization'));
  } finally {
    if (srv) srv.kill();
    try { rmDir(TMPDIR); } catch(e) {}
  }
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  process.exit(exitCode);
}
main().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
