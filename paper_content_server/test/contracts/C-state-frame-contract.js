#!/usr/bin/env node
// State-Frame Contract — HTTP-level state/frame coherence
var path = require('path');
var http = require('http');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var PORT = 8797;
var BASE = 'http://127.0.0.1:' + PORT;
var TMPDIR = path.join(ROOT, 'test_contract_c_' + Date.now());
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function fetch(p, timeout) {
  return new Promise(function(resolve, reject) {
    var req = http.get(BASE + p, function(res) {
      var d = [];
      res.on('data', function(c) { d.push(c); });
      res.on('end', function() { resolve({ s: res.statusCode, b: Buffer.concat(d), h: res.headers }); });
    });
    req.on('error', reject);
    req.setTimeout(timeout || 15000, function() { req.destroy(); reject(new Error('timeout')); });
  });
}

fs.mkdirSync(TMPDIR, { recursive: true });
var env = Object.assign({}, process.env, {
  PORT: String(PORT), TZ: 'Europe/Paris',
  TRANSLATION_PROVIDER: 'none', DATA_DIR: TMPDIR,
});
var cp = require('child_process');
var srv = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

async function main() {
  await new Promise(function(resolve, reject) {
    var timer = setInterval(function() {
      http.get(BASE + '/api/state.json', function(res) {
        var d = [];
        res.on('data', function(c) { d.push(c); });
        res.on('end', function() { if (res.statusCode === 200) { clearInterval(timer); resolve(); } });
      }).on('error', function() {});
    }, 2000);
    setTimeout(function() { clearInterval(timer); srv.kill(); reject(new Error('timeout')); }, 60000);
  });
  console.log('--- server ready ---');

  // GET state → frameId A
  var st1 = await fetch('/api/state.json');
  test('STATE_200', st1.s === 200, 'status=' + st1.s);
  var sj1 = JSON.parse(st1.b);
  var frameIdA = sj1.frameId || '';
  test('STATE_HAS_FRAMEID', !!frameIdA, 'frameId=' + frameIdA.slice(0, 40));

  // GET frame → X-Frame-Id must match state
  var fb = await fetch('/api/frame.bin');
  test('FRAME_200', fb.s === 200, 'status=' + fb.s);
  test('FRAME_192010', fb.b.length === 192010, 'len=' + fb.b.length);
  var xFrameId = fb.h['x-frame-id'] || '';
  test('FRAME_HAS_X_FRAME_ID', !!xFrameId, 'x-frame-id=' + xFrameId.slice(0, 40));
  test('STATE_FRAME_FRAMEID_MATCH', xFrameId === frameIdA, xFrameId.slice(0, 40) + ' vs ' + frameIdA.slice(0, 40));

  // Second state request within same time slot → may return same or different (depends on mode)
  var st2 = await fetch('/api/state.json');
  test('STATE_200_AGAIN', st2.s === 200, 'status=' + st2.s);

  // Frame EPF1 structure
  test('EPF1_MAGIC', fb.b.slice(0, 4).toString() === 'EPF1', fb.b.slice(0, 4).toString());
  var fw = fb.b.readUInt16LE(4);
  var fh = fb.b.readUInt16LE(6);
  test('DIMENSIONS_800x480', fw === 800 && fh === 480, fw + 'x' + fh);

  // Code 4 scan
  var code4 = 0;
  for (var i = 10; i < fb.b.length; i++) {
    var hi = (fb.b[i] >> 4) & 0x0F;
    var lo = fb.b[i] & 0x0F;
    if (hi === 4) code4++;
    if (lo === 4) code4++;
  }
  test('CODE4_ZERO', code4 === 0, 'code4=' + code4);

  // Frame content (news count check)
  test('FRAME_NON_EMPTY', fb.b.length === 192010, 'len=' + fb.b.length);

  srv.kill();
  setTimeout(function() {
    try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
    console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(exitCode);
  }, 1000);
}
main().catch(function(e) { console.log('FATAL: ' + e.message); srv.kill(); process.exit(1); });
