#!/usr/bin/env node
var cp = require('child_process');
var path = require('path');
var DIR = __dirname;
var totalPass = 0, totalFail = 0, exitCode = 0;

var tests = [
  { name: 'static-contract', file: 'r0-static-contract-test.js' },
  { name: 'http-behavior',   file: 'r0-http-behavior-test.js' },
  { name: 'restart-persistence', file: 'r0-restart-persistence-test.js' },
];

console.log('=== R0 Characterization Tests ===\n');

function runNext(idx) {
  if (idx >= tests.length) {
    console.log('\n=== R0 All: ' + totalPass + ' passed, ' + totalFail + ' failed ===');
    process.exit(exitCode);
    return;
  }
  var t = tests[idx];
  console.log('--- Running ' + t.name + ' ---');
  var child = cp.spawn(process.execPath, [path.join(DIR, t.file)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  var out = '', err = '';
  child.stdout.on('data', function (d) { out += d.toString(); process.stdout.write(d); });
  child.stderr.on('data', function (d) { err += d.toString(); process.stderr.write(d); });
  child.on('close', function (code) {
    var m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
    if (m) {
      totalPass += parseInt(m[1], 10);
      totalFail += parseInt(m[2], 10);
    }
    if (code !== 0) exitCode = 1;
    console.log('');
    runNext(idx + 1);
  });
}

runNext(0);
