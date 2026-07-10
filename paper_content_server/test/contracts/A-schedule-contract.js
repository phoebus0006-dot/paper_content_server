#!/usr/bin/env node
// Schedule Contract — direct call to production schedule module
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var lib = require(path.join(ROOT, 'lib', 'schedule.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function wallTime(y, M, d, h, m) {
  return { year: y, month: M, day: d, hour: h, minute: m };
}

var tz = 'Europe/Paris';

var cases = [
  { h: 9, m: 59, expect: 'photo' },
  { h: 10, m: 0, expect: 'photo' },
  { h: 10, m: 1, expect: 'photo' },
  { h: 10, m: 29, expect: 'photo' },
  { h: 10, m: 30, expect: 'news' },
  { h: 10, m: 31, expect: 'news' },
  { h: 10, m: 59, expect: 'news' },
  { h: 11, m: 0, expect: 'photo' },
  { h: 11, m: 29, expect: 'photo' },
  { h: 11, m: 30, expect: 'news' },
  { h: 11, m: 59, expect: 'news' },
  { h: 18, m: 0, expect: 'photo' },
  { h: 18, m: 30, expect: 'news' },
  { h: 18, m: 59, expect: 'news' },
  { h: 19, m: 0, expect: 'photo' },
  { h: 19, m: 30, expect: 'photo' },
  { h: 23, m: 30, expect: 'photo' },
];

cases.forEach(function(c) {
  var t = wallTime(2026, 7, 9, c.h, c.m);
  var r = lib.resolveDisplayMode(t, tz);
  var ok = r.mode === c.expect;
  test(String(c.h).padStart(2,'0') + ':' + String(c.m).padStart(2,'0') + ' -> ' + r.mode + ' (expected ' + c.expect + ')', ok, 'got=' + r.mode + ' slot=' + r.slotKey);
});

// Boundary crossing: 10:29:59 -> photo, 10:30:00 -> news
var b1 = lib.resolveDisplayMode(wallTime(2026, 7, 9, 10, 29), tz);
var b2 = lib.resolveDisplayMode(wallTime(2026, 7, 9, 10, 30), tz);
test('Boundary 10:29->10:30 produces different modes', b1.mode !== b2.mode, b1.mode + ' -> ' + b2.mode);

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
