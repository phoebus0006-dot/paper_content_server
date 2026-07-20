var http = require('http'); var path = require('path'); var fs = require('fs'); var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..', '..'); var PORT = 8892; var TMPDIR = path.join(ROOT, 'test_token_' + Date.now());
var passed = 0, failed = 0, exitCode = 0, TOKEN = 'test-admin-token-abc123';
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function get(url, token) {
  return new Promise(function(ok) {
    var o = { hostname: '127.0.0.1', port: PORT, path: url, headers: {} }; if (token) o.headers['Authorization'] = 'Bearer ' + token;
    http.get(o, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); }).on('error', function(e) { ok({ s: 0, err: e }); });
  });
}
async function waitSrv() { for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); } return false; }
async function main() {
  console.log('=== Admin Token Mode Compatibility Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'token', ADMIN_TOKEN: TOKEN, DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitSrv()) { console.log('FAIL: server did not start'); srv.kill(); process.exit(1); }
  var r1 = await get('/api/admin/dashboard'); check('TOKEN_MODE_NO_TOKEN=401', r1.s === 401);
  var r2 = await get('/api/admin/dashboard', 'wrong-token'); check('TOKEN_MODE_BAD_TOKEN=403', r2.s === 403);
  var r3 = await get('/api/admin/dashboard', TOKEN); check('TOKEN_MODE_VALID_TOKEN=200', r3.s === 200);
  var html = (await get('/admin/')).b.toString(); check('TOKEN_HTML_HAS_LOGIN_OVERLAY', html.indexOf('login-overlay') > -1);
  var access = await get('/api/admin/access-mode'); check('ACCESS_MODE_IS_TOKEN', JSON.parse(access.b.toString()).mode === 'token');
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  srv.kill(); try { rmDir(TMPDIR); } catch(e) {} process.exit(exitCode);
}
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
main().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
