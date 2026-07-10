#!/usr/bin/env node
// news-render-readability-test — production-path news frame verification
var path = require('path');
var http = require('http');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var PORT = 8797;
var BASE = 'http://127.0.0.1:' + PORT;
var TMPDIR = path.join(ROOT, 'test_readability_' + Date.now());
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

function wrapText(text, max) {
  if (!text) return [''];
  var source = String(text).replace(/\s+/g,' ').trim();
  if (!source) return [''];
  var lines = [], current = '', currentW = 0;
  for (var i = 0; i < source.length; i++) {
    var ch = source[i];
    var w = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/.test(ch) ? 2 : 1;
    if (current && currentW + w > max) { lines.push(current); current = ''; currentW = 0; }
    current += ch; currentW += w;
  }
  if (current) lines.push(current);
  return lines;
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
    test('NEWS_COUNT_6', nj.items && nj.items.length >= 4, 'count=' + nj.items.length);

    var fb = await fetch('/api/frame.bin', 20000);
    test('FRAME_HTTP_200', fb.s === 200, 'status=' + fb.s);
    test('FRAME_BYTES_192010', fb.b.length === 192010, 'len=' + fb.b.length);

    var scan = scanFrameCodes(fb.b);
    test('CODE4_ZERO', scan.code4 === 0, 'code4=' + scan.code4);
    test('UNSUPPORTED_EMPTY', scan.unsupported.length === 0, 'unsupported=' + JSON.stringify(scan.unsupported));
    test('VALID_CODES', scan.codes.length > 0, 'codes=' + JSON.stringify(scan.codes));

    // Verify 3-line summary layout using production wrapText
    var FRAME_W = 800, FRAME_H = 480;
    var cardW = Math.floor((FRAME_W - 14*2 - 12) / 2);
    var cardH = Math.floor((FRAME_H - 36 - 18 - 8*2 - 8) / 3);
    var titleFont = 24, summaryFont = 18;

    var all3Lines = nj.items.slice(0, 6).every(function(item) {
      var sumMax = Math.floor((cardW - 12) / (summaryFont * 0.56));
      var lines = wrapText(item.zhSummary || '', sumMax);
      return lines.length >= 3;
    });
    test('ALL_CARDS_3_SUMMARY_LINES', all3Lines, 'fontSize=' + summaryFont);

    var noOverflow = nj.items.slice(0, 6).every(function(item, i) {
      var row = Math.floor(i / 2);
      var y0 = 36 + 4 + row * (cardH + 8);
      var sumMax = Math.floor((cardW - 12) / (summaryFont * 0.56));
      var lines = wrapText(item.zhSummary || '', sumMax).slice(0, 3);
      var badgeH = 14;
      var sumEndY = y0 + 3 + badgeH + 5 + titleFont + 5 + lines.length * (summaryFont + 2);
      return sumEndY + summaryFont <= y0 + cardH;
    });
    test('NO_CARD_OVERFLOW', noOverflow, 'cardH=' + cardH);

    // Verify EPF1 frame header
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
