#!/usr/bin/env node
// news-render-readability-test — production-path layout via shared layoutNewsCard
var path = require('path');
var http = require('http');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var PORT = 8797;
var BASE = 'http://127.0.0.1:' + PORT;
var TMPDIR = path.join(ROOT, 'test_readability_' + Date.now());
var exitCode = 0, passed = 0, failed = 0;

var mod = require(path.join(ROOT, 'server.js'));
var layoutNewsCard = mod.layoutNewsCard;
var NEWS_LAYOUT = mod.NEWS_LAYOUT;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function fetch(p, timeout) {
  return new Promise(function(resolve, reject) {
    var req = http.get(BASE + p, function(res) {
      var d = [];
      res.on('data', function(c) { d.push(c); });
      res.on('end', function() { resolve({ s: res.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', reject);
    req.setTimeout(timeout || 15000, function() { req.destroy(); reject(new Error('timeout')); });
  });
}

function scanFrameCodes(buf) {
  var codes = {}, code4 = 0, unsupported = [];
  for (var i = 10; i < buf.length; i++) {
    var hi = (buf[i] >> 4) & 0x0F, lo = buf[i] & 0x0F;
    codes[hi] = (codes[hi]||0)+1; codes[lo] = (codes[lo]||0)+1;
    if (hi === 4) code4++; if (lo === 4) code4++;
    if (![0,1,2,3,5,6].includes(hi) && !unsupported.includes(hi)) unsupported.push(hi);
    if (![0,1,2,3,5,6].includes(lo) && !unsupported.includes(lo)) unsupported.push(lo);
  }
  return { codes: Object.keys(codes).map(Number).sort(), code4: code4, unsupported: unsupported.sort() };
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

  try {
    var nw = await fetch('/api/news.json', 60000);
    test('NEWS_HTTP_200', nw.s === 200, 'status=' + nw.s);
    var nj = JSON.parse(nw.b);
    test('NEWS_COUNT_6', nj.items && nj.items.length === 6, 'count=' + nj.items.length);

    var fb = await fetch('/api/frame.bin', 20000);
    test('FRAME_HTTP_200', fb.s === 200, 'status=' + fb.s);
    test('FRAME_BYTES_192010', fb.b.length === 192010, 'len=' + fb.b.length);

    var scan = scanFrameCodes(fb.b);
    test('CODE4_ZERO', scan.code4 === 0, 'code4=' + scan.code4);
    test('UNSUPPORTED_EMPTY', scan.unsupported.length === 0, 'unsupported=' + JSON.stringify(scan.unsupported));
    test('VALID_CODES', scan.codes.length > 0, 'codes=' + JSON.stringify(scan.codes));

    // Use shared production layoutNewsCard for every card
    if (!layoutNewsCard || !NEWS_LAYOUT) {
      test('LAYOUT_FN_MISSING', false, 'layoutNewsCard or NEWS_LAYOUT not exported');
    } else {
      var sumFont = NEWS_LAYOUT.summaryFont;
      var all3 = true, noOverflow = true;
      nj.items.slice(0, 6).forEach(function(item, i) {
        var layout = layoutNewsCard(item, NEWS_LAYOUT);
        var row = Math.floor(i / 2);
        var y0 = NEWS_LAYOUT.HEADER_H + 4 + row * (NEWS_LAYOUT.cardH + NEWS_LAYOUT.ROW_GAP);
        var sumEndY = y0 + 3 + NEWS_LAYOUT.badgeH + 5 + NEWS_LAYOUT.titleFont + 5 + 3 * (NEWS_LAYOUT.summaryFont + 2);
        var overflow = layout.overflow || (sumEndY + NEWS_LAYOUT.summaryFont > y0 + NEWS_LAYOUT.cardH);
        if (layout.summaryLineCount !== 3) all3 = false;
        if (overflow) noOverflow = false;
        test('CARD_' + (i+1) + '_SUMMARY_LINES=' + layout.summaryLineCount, layout.summaryLineCount === 3, 'summaryLines=' + layout.summaryLineCount + (layout.overflow ? ' OVERFLOW' : ''));
      });
      test('ALL_3_SUMMARY_LINES', all3, 'fontSize=' + sumFont);
      test('NO_OVERFLOW', noOverflow, 'cardH=' + NEWS_LAYOUT.cardH);
    }

    // EPF1 header
    test('EPF1_HEADER', fb.b.slice(0, 4).toString() === 'EPF1', 'magic=' + fb.b.slice(0, 4).toString());
    var fw = fb.b.readUInt16LE(4);
    var fh = fb.b.readUInt16LE(6);
    test('FRAME_DIMENSIONS', fw === 800 && fh === 480, fw + 'x' + fh);

  } catch(e) {
    test('TEST_FAIL', false, e.message);
  }

  srv.kill();
  setTimeout(function() {
    try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
    console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(exitCode);
  }, 1000);
}

main().catch(function(e) { console.log('FATAL: ' + e.message); srv.kill(); process.exit(1); });
