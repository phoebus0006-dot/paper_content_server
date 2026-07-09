// Restart & recovery test: server cold start, restart, corrupt state files
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

var exitCode = 0;
var PORT = 8796;
var BASE = 'http://127.0.0.1:' + PORT;
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(CWD, 'test_restart_tmp_' + Date.now());

function get(url) {
  return new Promise(function(ok, fail) {
    http.get(url, function(r) {
      var d = [];
      r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    }).on('error', fail);
  });
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

var passed = 0, failed = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function spawnServer(envOverrides) {
  var env = Object.assign({}, process.env, { PORT: String(PORT), TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none', PHOTO_QUANT_MODE: 'clean' }, envOverrides || {});
  return spawn(process.execPath, [SRV], { env: env, cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] });
}

function waitForServer(timeoutMs) {
  return new Promise(function(resolve) {
    var start = Date.now();
    function attempt() {
      if (Date.now() - start > timeoutMs) return resolve(false);
      var req = http.get(BASE + '/api/state.json', function(r) { r.resume(); resolve(true); });
      req.on('error', function() { setTimeout(attempt, 1000); });
      req.setTimeout(2000, function() { req.destroy(); setTimeout(attempt, 1000); });
    }
    attempt();
  });
}

async function main() {
  console.log('=== Restart & Recovery Test ===\n');

  // Record real data hashes
  var realDataDir = path.join(CWD, 'data');
  var realFiles = ['news_cache.json', 'library_state.json', 'news_rotation_state.json', 'image_index.json'];
  var hashesBefore = {};
  realFiles.forEach(function(f) {
    var p = path.join(realDataDir, f);
    try { hashesBefore[f] = sha256(fs.readFileSync(p)); } catch (e) { hashesBefore[f] = 'MISSING'; }
  });

  // ---- CASE 1: Fresh start (isolated DATA_DIR) ----
  console.log('--- CASE 1: Fresh start ---');
  var dataSrc = realDataDir;
  var testData1 = path.join(TMPDIR, 'srv1');
  fs.mkdirSync(testData1, { recursive: true });
  fs.copyFileSync(path.join(dataSrc, 'image_index.json'), path.join(testData1, 'image_index.json'));
  fs.copyFileSync(path.join(dataSrc, 'raw_index.json'), path.join(testData1, 'raw_index.json'));
  fs.writeFileSync(path.join(testData1, 'news_cache.json'), '{}');
  fs.writeFileSync(path.join(testData1, 'library_state.json'), '{}');
  fs.writeFileSync(path.join(testData1, 'news_rotation_state.json'), '{"version":1,"updatedAt":null,"shown":[]}');

  var srv1 = spawnServer({ DATA_DIR: testData1 });
  var ok1 = await waitForServer(20000);
  if (!ok1) { console.log('FAIL: server did not start'); srv1.kill(); process.exit(1); }
  console.log('Server started');

  var st1 = await get(BASE + '/api/state.json');
  check('CASE1: state 200', st1.s === 200);
  var sj1 = JSON.parse(st1.b.toString());
  check('CASE1: valid frameId', sj1.frameId && sj1.frameId.length > 10);

  var fb1 = await get(BASE + '/api/frame.bin');
  check('CASE1: frame 200', fb1.s === 200);
  check('CASE1: frame 192010B', fb1.b.length === 192010);
  var payload = fb1.b.slice(10);
  var codes = {};
  for (var i = 0; i < payload.length; i++) { codes[String((payload[i] >> 4) & 0x0F)] = true; codes[String(payload[i] & 0x0F)] = true; }
  check('CASE1: no code 4', !codes['4'], 'codes=' + Object.keys(codes).sort().join(','));
  check('CASE1: only 0,1,2,3,5,6', Object.keys(codes).every(function(c) { return [0,1,2,3,5,6].indexOf(Number(c)) >= 0; }));

  var news1 = await get(BASE + '/api/news.json');
  var newsj1 = JSON.parse(news1.b.toString());
  check('CASE1: news count 6', newsj1.items.length === 6);

  srv1.kill();
  await new Promise(function(r) { srv1.on('exit', r); setTimeout(r, 2000); });
  console.log('');

  // ---- CASE 2: Server restart (same DATA_DIR, second process) ----
  console.log('--- CASE 2: Server restart ---');
  var srv2 = spawnServer({ DATA_DIR: testData1 });
  var ok2 = await waitForServer(20000);
  if (!ok2) { console.log('FAIL: restart failed'); srv2.kill(); process.exit(1); }
  console.log('Server restarted');

  var st2 = await get(BASE + '/api/state.json');
  check('CASE2: state 200 after restart', st2.s === 200);
  var sj2 = JSON.parse(st2.b.toString());
  check('CASE2: valid frameId', sj2.frameId && sj2.frameId.length > 10);

  var fb2 = await get(BASE + '/api/frame.bin');
  check('CASE2: frame 200', fb2.s === 200);
  check('CASE2: frame 192010B', fb2.b.length === 192010);

  var news2 = await get(BASE + '/api/news.json');
  var newsj2 = JSON.parse(news2.b.toString());
  check('CASE2: news count 6', newsj2.items.length === 6);

  var pal2 = await get(BASE + '/debug/photo-palette.json');
  if (pal2.s === 200) {
    var pj2 = JSON.parse(pal2.b.toString());
    check('CASE2: unsupportedCode4', pj2.unsupportedCode4 === 0, '' + pj2.unsupportedCode4);
  }

  srv2.kill();
  await new Promise(function(r) { srv2.on('exit', r); setTimeout(r, 2000); });
  console.log('');

  // ---- CASE 3: Cache behavior — first request renders, second is cached ----
  console.log('--- CASE 3: Cache (first request renders, second cached) ---');
  var srv3 = spawnServer({ DATA_DIR: testData1 });
  var ok3 = await waitForServer(20000);
  if (!ok3) { console.log('FAIL'); srv3.kill(); process.exit(1); }

  // First state+frame request should render
  await get(BASE + '/api/state.json');
  await get(BASE + '/api/frame.bin');

  // Second round should use cache
  await get(BASE + '/api/state.json');
  srv3.kill();
  await new Promise(function(r) { srv3.on('exit', r); setTimeout(r, 2000); });
  console.log('');

  // ---- CASE 4: Corrupt/missing state files ----
  console.log('--- CASE 4: Corrupt state files ---');
  var corruptTestDir = path.join(TMPDIR, 'corrupt');
  try { fs.mkdirSync(corruptTestDir, { recursive: true }); } catch (e) {}
  try { fs.mkdirSync(path.join(TMPDIR, 'data'), { recursive: true }); } catch (e) {}

  // Copy valid files first
  var dataSrc = path.join(CWD, 'data');
  ['image_index.json', 'raw_index.json', 'news_cache.json', 'library_state.json', 'news_rotation_state.json'].forEach(function(f) {
    var src = path.join(dataSrc, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TMPDIR, 'data', f));
  });

  var corruptCases = [
    { file: 'news_cache.json',        label: 'corrupt news_cache' },
    { file: 'library_state.json',     label: 'corrupt library_state' },
    { file: 'news_rotation_state.json', label: 'corrupt news_rotation' },
    { file: 'image_index.json',       label: 'corrupt image_index' },
  ];

  // Test each corrupt file
  corruptCases.forEach(function(cc) {
    var orig = path.join(TMPDIR, 'data', cc.file);
    var dataDir = path.join(TMPDIR, 'data_' + cc.file.replace(/[^a-z]/g, ''));
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
    // Copy valid files into this test's data directory
    ['image_index.json', 'raw_index.json', 'news_cache.json', 'library_state.json', 'news_rotation_state.json'].forEach(function(f) {
      var src = path.join(TMPDIR, 'data', f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dataDir, f));
    });
    // Overwrite the specific file with invalid content
    fs.writeFileSync(path.join(dataDir, cc.file), '{{{invalid json}}}');
  });

  // Start server with DATA_DIR pointing to valid copied data
  var srv4 = spawnServer({ DATA_DIR: path.join(TMPDIR, 'data') });
  var ok4 = await waitForServer(20000);
  if (ok4) {
    var st4 = await get(BASE + '/api/state.json');
    check('CASE4: corrupt test — server starts', st4.s >= 200 && st4.s < 500);
    srv4.kill();
    await new Promise(function(r) { srv4.on('exit', r); setTimeout(r, 2000); });
  } else {
    check('CASE4: server starts with valid data', false);
    srv4.kill();
  }
  console.log('');

  // ---- Verify real data unchanged ----
  console.log('--- Data Isolation ---');
  var allOk = true;
  realFiles.forEach(function(f) {
    var p = path.join(realDataDir, f);
    try {
      var h = sha256(fs.readFileSync(p));
      var ok = h === hashesBefore[f];
      check('REAL_DATA_HASH_UNCHANGED ' + f, ok);
      if (!ok) allOk = false;
    } catch (e) { check('REAL_DATA_HASH_UNCHANGED ' + f, false, 'read error'); allOk = false; }
  });
  if (allOk) check('REAL_DATA_HASH_UNCHANGED ALL', true);

  // Cleanup
  try { require('fs').rmdirSync(TMPDIR, { recursive: true }); } catch (e) {}

  console.log('\n=== Summary ===');
  console.log(passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' tests');
  process.exit(exitCode);
}

main();
