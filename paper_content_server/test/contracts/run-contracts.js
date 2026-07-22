#!/usr/bin/env node
// run-contracts.js — Phase 1 unified contract runner
// Status model: PASS / FAIL / PARTIAL / NOT_IMPLEMENTED / SKIP / POLLUTION / CRASHED
// FAIL > 0 → exit 1. PARTIAL and NOT_IMPLEMENTED are informational.
// Tracked-data hash guard: every contract must leave repo data/ files unchanged.
var cp = require('child_process');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var CONTRACTS_DIR = __dirname;
var DATA_DIR = path.join(CONTRACTS_DIR, '..', '..', 'data');

// Discover tracked data files from git; only include files that actually exist on disk
var trackedRaw = cp.execSync('git ls-files data/', { cwd: path.join(CONTRACTS_DIR, '..', '..') }).toString();
var TRACKED_FILES = trackedRaw.split('\n').filter(Boolean).map(function(f) { return f.replace('data/', ''); }).filter(function(f) { return fs.existsSync(path.join(DATA_DIR, f)); });

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
var T_PASS = 0, T_FAIL = 0, T_PARTIAL = 0, T_NOT_IMP = 0, T_SKIP = 0, T_POLLUTION = 0, T_CRASHED = 0;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function captureHashes() {
  var hashes = {};
  TRACKED_FILES.forEach(function(f) {
    var fp = path.join(DATA_DIR, f);
    try { hashes[f] = sha256(fs.readFileSync(fp)); }
    catch (e) { hashes[f] = null; }
  });
  return hashes;
}

function computePollution(before, after) {
  var polluted = [];
  var keys = Object.keys(before || {});
  keys.forEach(function(f) {
    if (before[f] !== after[f]) polluted.push(f);
  });
  return polluted;
}

function runContract(fname) {
  return new Promise(function(resolve) {
    var targetPath = path.isAbsolute(fname) ? fname : path.join(CONTRACTS_DIR, fname);
    var child = cp.spawn(process.execPath, [targetPath], {
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
      if (code !== 0 && fail === 0) {
        fail = 1;
      }
      // Parse STATUS lines (PARTIAL, NOT_IMPLEMENTED)
      var partial = (out.match(/STATUS.*PARTIAL/g) || []).length;
      var notImpl = (out.match(/STATUS.*NOT_IMPLEMENTED/g) || []).length;
      var skip = (out.match(/\bSKIP\b/g) || []).length;

      var res = { name: fname, pass: pass, fail: fail, partial: partial, not_impl: notImpl, skip: skip, code: code, status: null, pollution: [] };
      results.push(res);
      resolve(res);
    });
  });
}

function classifyStatus(opts) {
  var out = opts.out || '';
  var pass = (out.match(/\bPASS\b/g) || []).length;
  var fail = (out.match(/\bFAIL\b/g) || []).length;
  var partial = (out.match(/STATUS.*PARTIAL/g) || []).length;
  var not_impl = (out.match(/STATUS.*NOT_IMPLEMENTED/g) || []).length;
  var code = opts.code;
  var pollution = opts.pollution || [];
  var status;
  var failDelta = 0;
  if (pollution.length > 0) {
    status = 'POLLUTION';
    failDelta = 1;
  } else if (code !== 0 && fail === 0) {
    status = 'CRASHED';
    failDelta = 1;
  } else {
    status = fail > 0 ? 'FAIL' : (partial > 0 ? 'PARTIAL' : (not_impl > 0 ? 'NOT_IMPLEMENTED' : 'PASS'));
    failDelta = fail;
  }
  return { status: status, pass: pass, fail: fail, partial: partial, not_impl: not_impl, failDelta: failDelta };
}

async function main() {
  console.log('=== Phase 1 Contracts Runner ===\n');
  for (var i = 0; i < contracts.length; i++) {
    var beforeHashes = captureHashes();
    await runContract(contracts[i]);
    var afterHashes = captureHashes();
    var pollution = computePollution(beforeHashes, afterHashes);
    var r = results[i];
    r.pollution = pollution;

    if (pollution.length > 0) {
      T_POLLUTION++;
      T_FAIL++;
      var status = 'POLLUTION';
      console.log(r.name + ': ' + r.pass + ' pass, ' + r.fail + ' fail, ' +
        r.partial + ' partial, ' + r.not_impl + ' not_impl [' + status + ']');
      console.log('  TRACKED_DATA_CHANGED: ' + pollution.join(', '));
    } else if (r.code !== 0 && r.fail === 0) {
      T_CRASHED++;
      T_FAIL++;
      var status = 'CRASHED';
      console.log(r.name + ': ' + r.pass + ' pass, ' + r.fail + ' fail, ' +
        r.partial + ' partial, ' + r.not_impl + ' not_impl [' + status + ']');
    } else {
      var status = r.fail > 0 ? 'FAIL' : (r.partial > 0 ? 'PARTIAL' : (r.not_impl > 0 ? 'NOT_IMPLEMENTED' : 'PASS'));
      if (r.fail > 0) T_FAIL += r.fail;
      T_PASS += r.pass;
      T_PARTIAL += r.partial;
      T_NOT_IMP += r.not_impl;
      T_SKIP += r.skip;
      console.log(r.name + ': ' + r.pass + ' pass, ' + r.fail + ' fail, ' +
        r.partial + ' partial, ' + r.not_impl + ' not_impl [' + status + ']');
    }

    // Allow OS to release ports between contracts
    await new Promise(function(res) { setTimeout(res, 2000); });
  }

  console.log('\n=== CONTRACT SUITE SUMMARY ===');
  console.log('FILES_RUN=' + contracts.length);
  console.log('TOTAL_PASS=' + T_PASS);
  console.log('TOTAL_FAIL=' + T_FAIL);
  console.log('TOTAL_PARTIAL=' + T_PARTIAL);
  console.log('TOTAL_NOT_IMPLEMENTED=' + T_NOT_IMP);
  console.log('TOTAL_SKIP=' + T_SKIP);
  console.log('FILES_CRASHED=' + T_CRASHED);
  console.log('TOTAL_POLLUTION=' + T_POLLUTION);

  var exitCode = T_FAIL > 0 ? 1 : 0;
  console.log('EXIT_CODE=' + exitCode);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch(function(e) { console.log('RUNNER_CRASH: ' + e.message); process.exit(1); });
}
module.exports = { classifyStatus, captureHashes, computePollution, runContract, main };
