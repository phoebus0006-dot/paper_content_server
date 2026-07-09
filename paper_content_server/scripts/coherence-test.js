// Coherence test: cross-slot boundary via test clock injection
// pinNowProvider enables deterministic TTL testing
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');

var exitCode = 0;
var PORT = 8798;
var BASE = 'http://127.0.0.1:' + PORT;
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);
var TMPDIR = path.join(__dirname, '..', 'test_data_tmp_' + Date.now());

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16); }

function get(url) {
  return new Promise(function(ok, fail) {
    http.get(url, function(r) {
      var d = [];
      r.on('data', function(c) { d.push(c); });
      r.on('end', function() { ok({ s: r.statusCode, h: r.headers, b: Buffer.concat(d) }); });
    }).on('error', function(e) { fail(e); });
  });
}

var passed = 0, failed = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (ok) { passed++; } else { failed++; exitCode = 1; }
}

function waitForServer(timeoutMs) {
  return new Promise(function(resolve) {
    var start = Date.now();
    function attempt() {
      if (Date.now() - start > timeoutMs) return resolve(false);
      var req = http.get(BASE + '/debug/clock', function(r) { r.resume(); resolve(true); });
      req.on('error', function() { setTimeout(attempt, 1500); });
      req.setTimeout(3000, function() { req.destroy(); setTimeout(attempt, 1500); });
    }
    attempt();
  });
}

function setClock(iso) {
  return get(BASE + '/debug/clock?iso=' + encodeURIComponent(iso));
}

async function crossBoundaryCase(label, stateIso, frameIso, expStateMode, expStateSlot) {
  console.log('\n--- ' + label + ' ---');

  // 1. Set clock to state time, establish baseline
  await setClock(stateIso);
  var s1 = await get(BASE + '/api/state.json');
  if (s1.s !== 200) { check(label + ' state HTTP', false); return; }
  var state = JSON.parse(s1.b.toString());
  console.log('  stateTime=' + stateIso + ' mode=' + state.mode + ' slot=' + (state.slotKey || ''));

  // 2. Get baseline frame (inside same slot, should be from pin)
  var fBase = await get(BASE + '/api/frame.bin');
  if (fBase.s !== 200) { check(label + ' baseline frame HTTP', false); return; }
  var baseHash = sha256(fBase.b);
  var basePinned = fBase.h['x-pinned'] === '1';

  // 3. Recreate baseline pin by calling state again (same clock = same slot)
  await setClock(stateIso);
  await get(BASE + '/api/state.json');

  // 4. Cross to the frame time (next slot)
  await setClock(frameIso);
  var fCross = await get(BASE + '/api/frame.bin');
  if (fCross.s !== 200) { check(label + ' cross frame HTTP', false); return; }
  var crossHash = sha256(fCross.b);
  var crossId = fCross.h['x-frame-id'] || '';
  var crossPinned = fCross.h['x-pinned'] === '1';
  var crossMode = fCross.h['x-frame-mode'] || '';
  var crossSlot = fCross.h['x-frame-slot'] || '';

  console.log('  frameTime=' + frameIso + ' servedMode=' + crossMode);
  check(label + ' X-Pinned=1', crossPinned);
  check(label + ' mode=' + expStateMode, crossMode === expStateMode);
  check(label + ' slot preserves', crossSlot && crossSlot.indexOf(expStateSlot) >= 0);
  check(label + ' frameId match', state.frameId === crossId);
  check(label + ' 192010B', fCross.b.length === 192010);

  // SHA256: pinned cross-boundary frame must match baseline
  check(label + ' hash same (pinned content unchanged)', crossHash === baseHash, baseHash + ' vs ' + crossHash);
}

async function main() {
  console.log('=== Coherence Test ===\n');

  // Record real data file SHA256 before test
  var hashBefore = {};
  var realDataFiles = ['news_cache.json', 'library_state.json', 'news_rotation_state.json', 'image_index.json'];
  var dataDir = path.join(CWD, 'data');
  realDataFiles.forEach(function(file) {
    var p = path.join(dataDir, file);
    try {
      var buf = require('fs').readFileSync(p);
      hashBefore[file] = crypto.createHash('sha256').update(buf).digest('hex');
    } catch (e) { hashBefore[file] = 'MISSING'; }
  });

  // Create temp data directory AND copy fixture BEFORE starting server
  try { require('fs').mkdirSync(TMPDIR, { recursive: true }); } catch (e) {}
  try {
    var f = require('fs');
    ['image_index.json', 'raw_index.json', 'library_state.json', 'news_cache.json', 'news_rotation_state.json'].forEach(function(file) {
      var src = path.join(dataDir, file);
      if (f.existsSync(src)) f.copyFileSync(src, path.join(TMPDIR, file));
    });
  } catch (e) { console.log('  (fixture copy: ' + e.message + ')'); }

  console.log('Starting server on port ' + PORT + '...');

  var srvEnv = Object.assign({}, process.env, {
    PORT: String(PORT),
    TZ: 'Europe/Paris',
    TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean',
    ENABLE_DEBUG_ROUTES: 'true',
    DATA_DIR: TMPDIR,
    NEWS_CACHE_FILE: path.join(TMPDIR, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(TMPDIR, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(TMPDIR, 'news_rotation_state.json'),
    IMAGE_INDEX_FILE: path.join(TMPDIR, 'image_index.json'),
    FEEDS_FILE: path.join(CWD, 'feeds.json'),
    CONFIG_FILE: path.join(CWD, 'config.json')
  });

  var server = spawn(process.execPath, [SRV], {
    env: srvEnv,
    cwd: CWD,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  var timer = setTimeout(function() {
    console.log('FAIL: server did not start within 35s');
    server.kill();
    try { require('fs').rmdirSync(TMPDIR, { recursive: true }); } catch (e) {}
    process.exit(1);
  }, 35000);

  var started = await waitForServer(30000);
  clearTimeout(timer);
  if (!started) { console.log('FAIL: could not connect'); server.kill(); try { require('fs').rmdirSync(TMPDIR, { recursive: true }); } catch (e) {} process.exit(1); }
  console.log('Server ready\n');

  // Verify resolved data paths are inside TMPDIR
  console.log('--- Config Paths ---');
  try {
    var cfg = await get(BASE + '/debug/config');
    var cj = JSON.parse(cfg.b.toString());
    var pathsOk = true;
    ['DATA_DIR', 'NEWS_CACHE_FILE', 'LIBRARY_STATE_FILE', 'NEWS_ROTATION_FILE', 'IMAGE_INDEX_FILE'].forEach(function(k) {
      var v = cj[k] || '';
      var inTmp = v.indexOf(TMPDIR) === 0;
      if (!inTmp) pathsOk = false;
      console.log('  ' + k + '=' + v + ' inTMPDIR=' + inTmp);
    });
    check('CONFIG: all resolved paths in TMPDIR', pathsOk);
  } catch (e) {
    console.log('  (config check skipped: ' + e.message + ')');
    check('CONFIG: path check', false);
  }

  try {
    // Case A: 10:29:59 -> 10:30:01
    await crossBoundaryCase('CaseA: cross 10:30', '2026-07-09T08:29:59.000Z', '2026-07-09T08:30:01.000Z', 'photo', 'T10:00');

    // Case B: 10:59:59 -> 11:00:01
    await crossBoundaryCase('CaseB: cross 11:00', '2026-07-09T08:59:59.000Z', '2026-07-09T09:00:01.000Z', 'news', 'T10:30');

    // Case C: 18:59:59 -> 19:00:01
    await crossBoundaryCase('CaseC: cross 19:00', '2026-07-09T16:59:59.000Z', '2026-07-09T17:00:01.000Z', 'news', 'T18:30');

    // Case D: 09:59:59 -> 10:00:01
    await crossBoundaryCase('CaseD: cross 10:00', '2026-07-09T07:59:59.000Z', '2026-07-09T08:00:01.000Z', 'photo', 'offhours');

    // TTL: t+29s -> HIT, t+31s -> MISS (using pinNowProvider clock)
    console.log('\n--- TTL ---');

    // HIT test: state at t0, frame at t0+29s
    await setClock('2026-07-09T08:00:00.000Z');
    await get(BASE + '/api/state.json');
    await setClock('2026-07-09T08:00:29.000Z');
    var f29 = await get(BASE + '/api/frame.bin');
    var f29Pin = f29.h['x-pinned'] === '1';
    check('TTL_29S_HIT', f29Pin);

    // MISS test: state at t0, frame at t0+31s (pin expired)
    await setClock('2026-07-09T08:05:00.000Z');
    await get(BASE + '/api/state.json');
    await setClock('2026-07-09T08:05:31.000Z');
    var f31 = await get(BASE + '/api/frame.bin');
    var f31Pin = f31.h['x-pinned'] === '1';
    check('TTL_31S_MISS', !f31Pin);

    // Render count: repeated state must NOT increase renderCount
    console.log('\n--- Render Count ---');
    var ps1 = await get(BASE + '/debug/pin-state.json');
    var psj1 = JSON.parse(ps1.b.toString());
    var rc1 = psj1.renderCount;
    await get(BASE + '/api/state.json');
    await get(BASE + '/api/state.json');
    await get(BASE + '/api/state.json');
    var ps2 = await get(BASE + '/debug/pin-state.json');
    var psj2 = JSON.parse(ps2.b.toString());
    check('RenderCount: 3 state requests did not increment', psj2.renderCount === rc1, '' + rc1 + ' -> ' + psj2.renderCount);

    // News and palette
    console.log('\n--- Pipeline ---');
    var news = await get(BASE + '/api/news.json');
    var nj = JSON.parse(news.b.toString());
    check('news count 6', nj.items.length === 6, '' + nj.items.length);
    var pal = await get(BASE + '/debug/photo-palette.json');
    var pj = JSON.parse(pal.b.toString());
    check('unsupportedCode4', pj.unsupportedCode4 === 0, '' + pj.unsupportedCode4);

  } catch (e) {
    console.log('CATASTROPHIC ERROR: ' + e.message);
    failed++; exitCode = 1;
  }

  // Stop server and wait for exit before cleanup
  server.kill();
  await new Promise(function(r) { server.on('exit', r); setTimeout(r, 3000); });

  // Verify real data files were NOT modified
  console.log('\n--- Data Isolation ---');
  var dataOk = true;
  realDataFiles.forEach(function(file) {
    var p = path.join(dataDir, file);
    var hashAfter;
    try { hashAfter = crypto.createHash('sha256').update(require('fs').readFileSync(p)).digest('hex'); } catch (e) { hashAfter = 'MISSING'; }
    var ok = hashBefore[file] === hashAfter;
    if (!ok) dataOk = false;
    check('REAL_DATA_HASH_UNCHANGED ' + file, ok);
  });
  if (dataOk) check('REAL_DATA_HASH_UNCHANGED ALL', true);

  // Clean up temp directory
  try { require('fs').rmdirSync(TMPDIR, { recursive: true }); } catch (e) {}
  console.log('\n=== Summary ===');
  console.log(passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' tests');
  process.exit(exitCode);
}

main().catch(function(e) {
  console.log('UNCAUGHT: ' + e.message);
  process.exit(1);
});
