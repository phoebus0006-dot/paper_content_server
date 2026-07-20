var http = require('http'); var path = require('path'); var fs = require('fs'); var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..'); var PORT = 8894; var TMPDIR = path.join(ROOT, 'test_cors_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function request(method, url, body, headers) {
  return new Promise(function(ok) {
    var j = body ? JSON.stringify(body) : ''; var o = { hostname: '127.0.0.1', port: PORT, path: url, method: method || 'GET', headers: headers || {} };
    if (body) { o.headers['content-type'] = 'application/json'; o.headers['content-length'] = Buffer.byteLength(j); }
    var r = http.request(o, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); }); });
    if (body) r.end(j); else r.end(); r.on('error', function(e) { ok({ s: 0, err: e }); });
  });
}
async function waitSrv() { for (var i = 0; i < 30; i++) { try { var r = await request('GET', '/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); } return false; }
async function main() {
  console.log('=== Admin Cross-Origin Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!await waitSrv()) { console.log('FAIL: server did not start'); srv.kill(); process.exit(1); }
  var r1 = await request('POST', '/api/admin/news/draft', { items: [] }, { 'content-type': 'application/json', 'origin': 'http://evil.com', 'referer': 'http://evil.com/page' }); check('CROSS_ORIGIN_POST_DENIED=403', r1.s === 403);
  if (r1.s === 403) { var e = JSON.parse(r1.b.toString()); check('CROSS_ORIGIN_ERROR', e.error === 'ADMIN_CROSS_ORIGIN_DENIED'); }
  var r2 = await request('POST', '/api/admin/news/draft', { items: [] }, { 'content-type': 'application/json', 'origin': 'http://127.0.0.1:' + PORT, 'referer': 'http://127.0.0.1:' + PORT + '/admin/' }); check('SAME_ORIGIN_POST_ALLOWED', r2.s === 400 || r2.s === 200);
  var r3 = await request('GET', '/admin/'); check('WILDCARD_CORS_ABSENT', !r3.h['access-control-allow-origin']);
  var badCT = await request('POST', '/api/admin/news/draft', 'text', { 'content-type': 'text/plain' }); check('BAD_CONTENT_TYPE_DENIED', badCT.s === 403 || badCT.s === 400);
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  srv.kill(); try { rmDir(TMPDIR); } catch(e) {} process.exit(exitCode);
}
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
main().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
