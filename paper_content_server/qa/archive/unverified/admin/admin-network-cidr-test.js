var http = require('http'); var path = require('path'); var fs = require('fs'); var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..'); var PORT = 8893; var TMPDIR = path.join(ROOT, 'test_cidr_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url }, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); }).on('error', function(e) { ok({ s: 0, err: e }); });
  });
}
function getWithXFF(url) {
  return new Promise(function(ok) {
    var req = http.get({ hostname: '127.0.0.1', port: PORT, path: url, headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' } }, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); }).on('error', function(e) { ok({ s: 0, err: e }); });
  });
}
async function waitSrv() { for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); } return false; }

// Phase A: allow only 10.0.0.0/8 — 127.0.0.1 should be DENIED
async function testPhaseA() {
  console.log('--- Phase A: ALLOW 10.0.0.0/8 only ---');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '10.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitSrv()) { console.log('FAIL: server did not start'); srv.kill(); process.exit(1); }
  var r1 = await get('/admin/'); check('CIDR_DENY_ADMIN_PAGE', r1.s === 403);
  var r2 = await get('/api/admin/dashboard'); check('CIDR_DENY_API', r2.s === 403);
  var r3 = await get('/api/state.json'); check('CIDR_NOEFFECT_STATE', r3.s === 200);
  srv.kill(); try { rmDir(TMPDIR); } catch(e) {}
}

// Phase B: allow 127.0.0.0/8 — 127.0.0.1 should be ALLOWED
async function testPhaseB() {
  console.log('--- Phase B: ALLOW 127.0.0.0/8 ---');
  var TMPDIR2 = path.join(ROOT, 'test_cidr_b_' + Date.now());
  try { fs.mkdirSync(TMPDIR2, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR2, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitSrv()) { console.log('FAIL: server did not start'); srv.kill(); process.exit(1); }
  var r1 = await get('/admin/'); check('CIDR_ALLOW_ADMIN_PAGE', r1.s === 200);
  var r2 = await get('/api/admin/dashboard'); check('CIDR_ALLOW_API', r2.s === 200);
  srv.kill(); try { rmDir(TMPDIR2); } catch(e) {}
}

// Phase C: XFF ignored when TRUST_PROXY=false
async function testPhaseC() {
  console.log('--- Phase C: XFF ignored (TRUST_PROXY=false) ---');
  var TMPDIR3 = path.join(ROOT, 'test_cidr_c_' + Date.now());
  try { fs.mkdirSync(TMPDIR3, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '1.2.3.4/32', TRUST_PROXY: 'false', DATA_DIR: TMPDIR3, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitSrv()) { console.log('FAIL: server did not start'); srv.kill(); process.exit(1); }
  var r1 = await getWithXFF('/admin/'); check('UNTRUSTED_XFF_IGNORED_ACCESS_DENIED', r1.s === 403);
  srv.kill(); try { rmDir(TMPDIR3); } catch(e) {}
}

async function main() {
  console.log('=== Admin Network CIDR Test ===');
  await testPhaseA();
  await testPhaseB();
  await testPhaseC();
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  process.exit(exitCode);
}
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
main().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
