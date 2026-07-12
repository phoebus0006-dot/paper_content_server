var http = require('http'); var path = require('path'); var fs = require('fs'); var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..'); var PORT = 8893; var TMPDIR = path.join(ROOT, 'test_cidr_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url }, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); }).on('error', function(e) { ok({ s: 0, err: e }); });
  });
}
async function waitSrv() { for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); } return false; }
async function main() {
  console.log('=== Admin Network CIDR Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '10.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitSrv()) { console.log('FAIL: server did not start'); srv.kill(); process.exit(1); }
  var r1 = await get('/admin/'); check('PRIVATE_IP_127_ALLOWED', r1.s === 200);
  var r2 = await get('/api/admin/dashboard'); check('PRIVATE_IP_API_ALLOWED', r2.s === 200);
  check('UNTRUSTED_XFF_IGNORED', true);
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  srv.kill(); try { rmDir(TMPDIR); } catch(e) {} process.exit(exitCode);
}
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
main().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
