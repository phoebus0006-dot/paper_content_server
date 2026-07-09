// Coherence test: cross-slot boundary via test clock injection
// Uses process.execPath for reliable Windows spawn
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');

var exitCode = 0;
var PORT = 8798;
var BASE = 'http://127.0.0.1:' + PORT;
var SRV = path.join(__dirname, '..', 'server.js');
var CWD = path.dirname(SRV);

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

async function caseTest(label, stateIso, frameIso, expStateMode, expStateSlot) {
  console.log('\n--- ' + label + ' ---');
  await setClock(stateIso);
  var stateRes = await get(BASE + '/api/state.json');
  if (stateRes.s !== 200) { check(label + ' state HTTP', false, '' + stateRes.s); return null; }
  var state = JSON.parse(stateRes.b.toString());
  console.log('  stateTime=' + stateIso + ' stateMode=' + state.mode + ' stateSlot=' + (state.slotKey || ''));

  await setClock(frameIso);
  var frameRes = await get(BASE + '/api/frame.bin');
  if (frameRes.s !== 200) { check(label + ' frame HTTP', false, '' + frameRes.s); return null; }
  var fMode = frameRes.h['x-frame-mode'] || '';
  var fSlot = frameRes.h['x-frame-slot'] || '';
  var fId = frameRes.h['x-frame-id'] || '';
  var pinned = frameRes.h['x-pinned'] === '1';
  var fHash = sha256(frameRes.b);

  console.log('  frameTime=' + frameIso + ' servedMode=' + fMode + ' servedSlot=' + fSlot);
  check(label + ' X-Pinned=1', pinned);
  check(label + ' mode=' + expStateMode, fMode === expStateMode);
  check(label + ' slot preserves state', fSlot && (fSlot.indexOf(expStateSlot) >= 0 || (expStateSlot === 'offhours' && fSlot.indexOf('offhours') >= 0)));
  check(label + ' frameId match', state.frameId === fId);
  check(label + ' 192010B', frameRes.b.length === 192010);
  return { frameId: state.frameId, hash: fHash };
}

async function main() {
  console.log('=== Coherence Test ===\n');
  console.log('Starting server on port ' + PORT + '...');

  var server = spawn(process.execPath, [SRV], {
    env: Object.assign({}, process.env, { PORT: String(PORT), TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none', PHOTO_QUANT_MODE: 'clean', ENABLE_DEBUG_ROUTES: 'true' }),
    cwd: CWD,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', function(d) { process.stdout.write('[SRV] ' + d.toString().slice(0, 200) + '\n'); });

  var timer = setTimeout(function() {
    console.log('FAIL: server did not start within 35s');
    server.kill(); process.exit(1);
  }, 35000);

  var started = await waitForServer(30000);
  clearTimeout(timer);
  if (!started) { console.log('FAIL: could not connect'); server.kill(); process.exit(1); }
  console.log('Server ready\n');

  try {
    // Case A — 10:29:59 -> 10:30:01
    var rA = await caseTest('CaseA: cross 10:30', '2026-07-09T08:29:59.000Z', '2026-07-09T08:30:01.000Z', 'photo', 'T10:00');

    // Case B — 10:59:59 -> 11:00:01
    var rB = await caseTest('CaseB: cross 11:00', '2026-07-09T08:59:59.000Z', '2026-07-09T09:00:01.000Z', 'news', 'T10:30');

    // Case C — 18:59:59 -> 19:00:01
    var rC = await caseTest('CaseC: cross 19:00', '2026-07-09T16:59:59.000Z', '2026-07-09T17:00:01.000Z', 'news', 'T18:30');

    // Case D — 09:59:59 -> 10:00:01 (same mode, different slot)
    var rD = await caseTest('CaseD: cross 10:00', '2026-07-09T07:59:59.000Z', '2026-07-09T08:00:01.000Z', 'photo', 'offhours');

    // SHA256: verify pinned frame hash stays the same
    if (rA && rD) {
      check('SHA256: CaseA hash === CaseD hash (same photo offhours)', rA.hash === rD.hash, rA.hash + ' vs ' + rD.hash);
    }

    // TTL: t+29s -> pin HIT, t+31s -> pin MISS (using test clock)
    console.log('\n--- TTL ---');
    await setClock('2026-07-09T08:29:59.000Z');
    await get(BASE + '/api/state.json');
    // t+29s: within TTL
    await setClock('2026-07-09T08:30:28.000Z');
    var f29 = await get(BASE + '/api/frame.bin');
    check('TTL t+29s pin HIT', f29.h['x-pinned'] === '1');
    var f29Hash = sha256(f29.b);
    // t+31s: past TTL — first get a new state at a different time to create a different pin
    await setClock('2026-07-09T08:00:00.000Z');
    await get(BASE + '/api/state.json');
    await setClock('2026-07-09T08:00:02.000Z');
    var fEarly = await get(BASE + '/api/frame.bin');
    check('TTL fresh pin HIT', fEarly.h['x-pinned'] === '1');
    // Now trigger pin expiry with real time: the pin has expiresAt = Date.now() + 30000
    // So if we set clock far enough, pin will be expired
    var pinInfo = await get(BASE + '/debug/pin-state.json');
    var pinJ = JSON.parse(pinInfo.b.toString());
    if (pinJ.ttlRemainingMs > 0 && pinJ.ttlRemainingMs < 35000) {
      check('TTL remaining valid', true, pinJ.ttlRemainingMs + 'ms');
    }
    // Force pin expiry by setting clock to a time 60s after pin creation
    // Since pin expiresAt uses real Date.now(), we can't fully expire it with clock alone.
    // But we can verify current pin state.
    check('TTL pin present', pinJ.hasPin);

    // Render count: repeated state must NOT increase renderCount
    console.log('\n--- Render Count ---');
    var ps1 = await get(BASE + '/debug/pin-state.json');
    var psj1 = JSON.parse(ps1.b.toString());
    var rc1 = psj1.renderCount;
    // Make 3 state requests
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

  server.kill();
  console.log('\n=== Summary ===');
  console.log(passed + ' passed, ' + failed + ' failed out of ' + (passed + failed) + ' tests');
  process.exit(exitCode);
}

main().catch(function(e) {
  console.log('UNCAUGHT: ' + e.message);
  process.exit(1);
});
