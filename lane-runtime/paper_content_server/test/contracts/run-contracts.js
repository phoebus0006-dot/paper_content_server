#!/usr/bin/env node
// run-contracts.js — Phase 1 unified contract runner
// Status model: PASS / FAIL / PARTIAL / NOT_IMPLEMENTED / SKIP
// FAIL > 0 → exit 1. PARTIAL and NOT_IMPLEMENTED are informational.
var cp = require('child_process');
var path = require('path');
var CONTRACTS_DIR = __dirname;

var contracts = [
  'A-schedule-contract.js',
  'B-epf1-contract.js',
  'C-state-frame-contract.js',
  'D-schedule-night-contract.js',
  'E-news-contract.js',
  'F-news-render-contract.js',
  'G-photo-contract.js',
  'H-safety-contract.js',
  'I-news-lastgood-contract.js',
  'J-admin-contract.js',
  'K-operating-modes-contract.js',
];

var results = [];
var T_PASS = 0, T_FAIL = 0, T_PARTIAL = 0, T_NOT_IMP = 0, T_SKIP = 0;

function runContract(fname) {
  return new Promise(function(resolve) {
    var child = cp.spawn(process.execPath, [path.join(CONTRACTS_DIR, fname)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.join(CONTRACTS_DIR, '..', '..')
    });
    var out = '';
    child.stdout.on('data', function(d) { out += d.toString(); });
    child.stderr.on('data', function(d) { out += d.toString(); });
    child.on('exit', function(code) {
      // Parse PASS/FAIL from assertions
      var pass = (out.match(/\bPASS\b/g) || []).length;
      var fail = (out.match(/\bFAIL\b/g) || []).length;
      // Parse STATUS lines (PARTIAL, NOT_IMPLEMENTED)
      var partial = (out.match(/STATUS.*PARTIAL/g) || []).length;
      var notImpl = (out.match(/STATUS.*NOT_IMPLEMENTED/g) || []).length;
      var skip = (out.match(/\bSKIP\b/g) || []).length;
      var crashed = code !== 0 && fail === 0;

      if (crashed) {
        T_FAIL++;
        results.push({ name: fname, pass: 0, fail: 1, partial: 0, not_impl: 0, skip: 0, status: 'CRASHED' });
      } else {
        T_PASS += pass;
        T_FAIL += fail;
        T_PARTIAL += partial;
        T_NOT_IMP += notImpl;
        T_SKIP += skip;
        var status = fail > 0 ? 'FAIL' : (partial > 0 ? 'PARTIAL' : (notImpl > 0 ? 'NOT_IMPLEMENTED' : 'PASS'));
        results.push({ name: fname, pass: pass, fail: fail, partial: partial, not_impl: notImpl, skip: skip, status: status });
      }

      // Allow OS to release ports between contracts
      setTimeout(resolve, 2000);
    });
  });
}

async function main() {
  console.log('=== Phase 1 Contracts Runner ===\n');
  for (var i = 0; i < contracts.length; i++) {
    await runContract(contracts[i]);
    var r = results[i];
    console.log(r.name + ': ' + r.pass + ' pass, ' + r.fail + ' fail, ' +
      r.partial + ' partial, ' + r.not_impl + ' not_impl [' + r.status + ']');
  }

  console.log('\n=== CONTRACT SUITE SUMMARY ===');
  console.log('FILES_RUN=' + contracts.length);
  console.log('FILES_CRASHED=' + results.filter(function(r){return r.status==='CRASHED'}).length);
  console.log('TOTAL_PASS=' + T_PASS);
  console.log('TOTAL_FAIL=' + T_FAIL);
  console.log('TOTAL_PARTIAL=' + T_PARTIAL);
  console.log('TOTAL_NOT_IMPLEMENTED=' + T_NOT_IMP);
  console.log('TOTAL_SKIP=' + T_SKIP);

  var exitCode = T_FAIL > 0 ? 1 : 0;
  console.log('EXIT_CODE=' + exitCode);
  process.exit(exitCode);
}

main().catch(function(e) {
  console.log('RUNNER_CRASH: ' + e.message);
  process.exit(1);
});
