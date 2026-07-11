#!/usr/bin/env node
// R3 test runner — executes all R3 tests sequentially

var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var tests = [
  'test/r3/snapshot-model-test.js',
  'test/r3/snapshot-store-test.js',
  'test/r3/snapshot-cache-test.js',
  'test/r3/pin-store-test.js',
  'test/r3/publication-lock-test.js',
  'test/r3/notification-port-test.js',
  'test/r3/operating-mode-service-test.js',
  'test/r3/publication-history-test.js',
  'test/r3/publication-service-test.js',
  'test/r3/publication-atomicity-test.js',
  'test/r3/publication-concurrency-test.js',
  'test/r3/state-frame-snapshot-test.js',
  'test/r3/restart-recovery-test.js',
  'test/r3/admin-publication-integration-test.js',
  'test/r3/rollback-integration-test.js',
  'test/r3/snapshot-corruption-test.js',
  'test/r3/dependency-boundary-test.js',
];

var overallFail = false;
tests.forEach(function(testFile) {
  var testPath = path.join(ROOT, testFile);
  console.log('\n=== Running ' + testFile + ' ===');
  var result = cp.spawnSync(process.execPath, [testPath], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 60000,
  });
  if (result.status !== 0) {
    console.log('FAIL: ' + testFile + ' exited with code ' + result.status);
    overallFail = true;
  }
});

if (overallFail) {
  console.log('\n=== R3: some tests FAILED ===');
  process.exit(1);
} else {
  console.log('\n=== R3: ALL TESTS PASSED ===');
  process.exit(0);
}
