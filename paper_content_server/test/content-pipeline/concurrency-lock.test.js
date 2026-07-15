var http = require('http');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var PORT = 8892;
var TMPDIR = path.join(ROOT, 'test_conc_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;

function check(label, cond) { if (cond) { passed++; console.log('PASS', label) } else { failed++; exitCode = 1; console.log('FAIL', label) } }

function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url }, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d).toString(), h: r.headers }); });
    }).on('error', function(e) { ok({ s: 0, b: null, err: e }); });
  });
}

function post(url, body) {
  return new Promise(function(ok) {
    var j = JSON.stringify(body || {});
    var opts = { hostname: '127.0.0.1', port: PORT, path: url, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(j), 'origin': 'http://127.0.0.1:' + PORT, 'referer': 'http://127.0.0.1:' + PORT + '/admin/' } };
    var r = http.request(opts, function(r) { var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d).toString(), h: r.headers }); }); });
    r.end(j); r.on('error', function(e) { ok({ s: 0, b: null, err: e }); });
  });
}

async function waitForServer() {
  for (var i = 0; i < 30; i++) { try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {} await new Promise(function(r) { setTimeout(r, 1000); }); }
  return false;
}

async function main() {
  console.log('=== Content Pipeline Concurrency Lock Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  
  if (!await waitForServer()) { console.log('FAIL: server did not start'); server.kill(); process.exit(1); }
  
  // Test 1: News sync concurrency
  console.log('-- Testing News Sync Concurrency --');
  var req1 = post('/api/admin/content-sync/news');
  var req2 = post('/api/admin/content-sync/news');
  
  var [res1, res2] = await Promise.all([req1, req2]);
  
  // One should be 200, the other 409
  var statuses = [res1.s, res2.s].sort();
  console.log('News sync statuses:', statuses, 'Bodies:', res1.b, res2.b);
  check('NEWS_CONCURRENT_ONE_ACCEPTED_ONE_REJECTED', statuses[0] === 200 && statuses[1] === 409);
  
  // Test 2: Photo sync concurrency
  console.log('-- Testing Photo Sync Concurrency --');
  var preq1 = post('/api/admin/content-sync/photos');
  var preq2 = post('/api/admin/content-sync/photos');
  
  var [pres1, pres2] = await Promise.all([preq1, preq2]);
  var pStatuses = [pres1.s, pres2.s].sort();
  console.log('Photo sync statuses:', pStatuses, 'Bodies:', pres1.b, pres2.b);
  check('PHOTO_CONCURRENT_ONE_ACCEPTED_ONE_REJECTED', pStatuses[0] === 200 && pStatuses[1] === 409);
  
  // Wait a bit for tasks to complete
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 3: Status API checks
  console.log('-- Testing Status API --');
  var sreq = await get('/api/admin/content-sync/status');
  check('STATUS_API_200', sreq.s === 200);
  if (sreq.s === 200) {
    var statusData = JSON.parse(sreq.b);
    check('STATUS_API_HAS_NEWS_AND_PHOTOS', !!statusData.news && !!statusData.photos);
    check('STATUS_HAS_LAST_ATTEMPT_AT', statusData.news.lastAttemptAt > 0 && statusData.photos.lastAttemptAt > 0);
  }

  server.kill();
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch(e) {}
  console.log('Done: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(exitCode);
}

main().catch(e => { console.error(e); process.exit(1); });
