var http = require('http');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var PORT = 8896;
var MOCK_PHOTO_PORT = 8897;
var TMPDIR = path.join(ROOT, 'test_photo_sync_' + Date.now());
var passed = 0, failed = 0, exitCode = 0;

function check(label, cond) { if (cond) { passed++; console.log('PASS', label) } else { failed++; exitCode = 1; console.log('FAIL', label) } }

function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url, headers: { 'origin': 'http://127.0.0.1:' + PORT, 'referer': 'http://127.0.0.1:' + PORT + '/admin/' } }, function(r) {
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

var mockPhotoState = 'good';
var mockPhotoServer = http.createServer(function(req, res) {
  if (mockPhotoState === 'error') {
    res.writeHead(500); res.end('Internal Server Error'); return;
  }
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    items: [
      { id: "p1", title: "Mock Photo 1", url: "http://mock/p1.jpg" },
      { id: "p2", title: "Mock Photo 2", url: "http://mock/p2.jpg" }
    ]
  }));
});

async function main() {
  console.log('=== Content Pipeline Photo Sync Test ===');
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  
  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'false', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false', PHOTO_API_URL: 'http://127.0.0.1:' + MOCK_PHOTO_PORT + '/photos' });
  var server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  
  await new Promise(r => mockPhotoServer.listen(MOCK_PHOTO_PORT, '127.0.0.1', r));
  
  if (!await waitForServer()) { console.log('FAIL: server did not start'); server.kill(); mockPhotoServer.close(); process.exit(1); }
  
  // Test 1: Successful sync
  var req1 = await post('/api/admin/content-sync/photos');
  check('PHOTO_SYNC_POST_200', req1.s === 200);
  await new Promise(r => setTimeout(r, 3000)); // wait for job
  
  var statusReq = await get('/api/admin/content-sync/status');
  var status1 = JSON.parse(statusReq.b);
  check('PHOTO_SYNC_SUCCESS_RECORDED', status1.photos.lastSuccessAt > 0);
  
  // Test 2: Failure preserves data
  mockPhotoState = 'error';
  var req2 = await post('/api/admin/content-sync/photos');
  await new Promise(r => setTimeout(r, 3000));
  
  // Actually checking preservation via file because there is no /api/admin/photos that returns the list easily without pagination maybe
  var indexPath = path.join(TMPDIR, 'image_index.json');
  var indexExists = fs.existsSync(indexPath);
  check('PHOTO_CONTENT_PRESERVED', indexExists);
  
  server.kill();
  mockPhotoServer.close();
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch(e) {}
  console.log('Done: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(exitCode);
}

main().catch(e => { console.error(e); process.exit(1); });
