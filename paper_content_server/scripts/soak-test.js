// Soak test: repeated health/state/frame/news checks over configurable duration
// Usage: SOAK_MINUTES=5 node scripts/soak-test.js
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');

var exitCode = 0;
var PORT = 8796 + Math.floor(Math.random() * 50);
var BASE = 'http://127.0.0.1:' + PORT;
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(CWD, 'test_soak_' + Date.now());

var SOAK_MINUTES = Number(process.env.SOAK_MINUTES) || 2;
var POLL_INTERVAL_MS = 30000;
var POLL_COUNT = Math.ceil((SOAK_MINUTES * 60000) / POLL_INTERVAL_MS);

var totalPolls = 0, stateFail = 0, frameFail = 0, newsFail = 0, healthFail = 0;
var totalCode4 = 0;
var rssStart = 0, rssEnd = 0, rssPeak = 0;
var passed = 0, failed = 0;

function get(url) {
  return new Promise(function(ok, fail) {
    http.get(url, function(r) {
      var d = [];
      r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d) }); });
    }).on('error', fail);
  });
}

function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function main() {
  console.log('=== Soak Test ===');
  console.log('Duration: ' + SOAK_MINUTES + ' min, interval: ' + POLL_INTERVAL_MS + 'ms, polls: ' + POLL_COUNT + '\n');

  // Start server
  var server = spawn(process.execPath, [SRV], {
    env: Object.assign({}, process.env, { PORT: String(PORT), TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none', PHOTO_QUANT_MODE: 'clean', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' }),
    cwd: CWD, stdio: ['ignore', 'pipe', 'pipe']
  });

  function stopServer() {
    server.kill();
    return new Promise(function(r) { server.on('exit', r); setTimeout(r, 2000); });
  }

  // Wait for server
  var ready = false;
  for (var i = 0; i < 60; i++) {
    try { var r = await get(BASE + '/api/health.json'); if (r.s === 200) { ready = true; break; } } catch (e) {}
    await sleep(1000);
  }
  if (!ready) { console.log('FAIL: server did not start'); process.exit(1); }

  // Get initial memory
  rssStart = process.memoryUsage().rss;
  rssPeak = rssStart;

  var startTime = Date.now();
  console.log('Soak started at ' + new Date().toISOString() + ', rss=' + Math.round(rssStart / 1024 / 1024) + 'MB\n');

  for (var poll = 0; poll < POLL_COUNT; poll++) {
    var mem = process.memoryUsage().rss;
    if (mem > rssPeak) rssPeak = mem;

    // Health
    try {
      var h = await get(BASE + '/api/health.json');
      if (h.s !== 200) healthFail++;
      var hj = JSON.parse(h.b.toString());
    } catch (e) { healthFail++; }

    // State
    try {
      var st = await get(BASE + '/api/state.json');
      if (st.s !== 200) stateFail++;
    } catch (e) { stateFail++; }

    // Frame
    try {
      var fb = await get(BASE + '/api/frame.bin');
      if (fb.s !== 200 || fb.b.length !== 192010) { frameFail++; }
      else {
        var p = fb.b.slice(10), codes = {};
        for (var k = 0; k < p.length; k++) { codes[String((p[k] >> 4) & 0x0F)] = true; codes[String(p[k] & 0x0F)] = true; }
        if (codes['4']) totalCode4++;
      }
    } catch (e) { frameFail++; }

    // News
    try {
      var nw = await get(BASE + '/api/news.json');
      if (nw.s !== 200) newsFail++;
      else { var nj = JSON.parse(nw.b.toString()); if (nj.items.length !== 6) newsFail++; }
    } catch (e) { newsFail++; }

    totalPolls++;
    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write('  [' + elapsed + 's] poll=' + totalPolls + '/' + POLL_COUNT + ' state=' + stateFail + ' frame=' + frameFail + ' mem=' + Math.round(mem / 1024 / 1024) + 'MB\r');

    if (poll < POLL_COUNT - 1) await sleep(POLL_INTERVAL_MS);
  }

  rssEnd = process.memoryUsage().rss;
  var elapsed = Math.floor((Date.now() - startTime) / 1000);

  console.log('\n\n' + totalPolls + ' polls completed in ' + elapsed + 's');
  check('soak: no health failures', healthFail === 0, 'healthFail=' + healthFail);
  check('soak: no state failures', stateFail === 0, 'stateFail=' + stateFail);
  check('soak: no frame failures', frameFail === 0, 'frameFail=' + frameFail);
  check('soak: no news failures', newsFail === 0, 'newsFail=' + newsFail);
  check('soak: no code4 leaks', totalCode4 === 0, 'code4Count=' + totalCode4);
  check('soak: memory stable', rssEnd < rssStart * 1.5, 'rss=' + Math.round(rssStart / 1024 / 1024) + ' -> ' + Math.round(rssEnd / 1024 / 1024) + ' peak=' + Math.round(rssPeak / 1024 / 1024) + ' MB');

  console.log('\nMemory: start=' + Math.round(rssStart / 1024 / 1024) + 'MB end=' + Math.round(rssEnd / 1024 / 1024) + 'MB peak=' + Math.round(rssPeak / 1024 / 1024) + 'MB');

  await stopServer();
  try { require('fs').rmdirSync(TMPDIR, { recursive: true }); } catch (e) {}
  console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(exitCode);
}

main().catch(function(e) { console.error('UNCAUGHT: ' + e.message); process.exit(1); });
