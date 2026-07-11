#!/usr/bin/env node
// R2 test runner — executes all R2 tests sequentially

var path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var tests = [
  'test/r2/palette-test.js',
  'test/r2/quantizer-test.js',
  'test/r2/epf1-test.js',
  'test/r2/frame-validator-test.js',
  'test/r2/image-frame-parity-test.js',
  'test/r2/dependency-boundary-test.js',
];

var overallFail = false;
tests.forEach(function(testFile) {
  var testPath = path.join(ROOT, testFile);
  console.log('\n=== Running ' + testFile + ' ===');
  var result = cp.spawnSync(process.execPath, [testPath], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120000,
  });
  if (result.status !== 0) {
    console.log('FAIL: ' + testFile + ' exited with code ' + result.status);
    overallFail = true;
  }
});

if (overallFail) {
  console.log('\n=== R2: some tests FAILED ===');
  process.exit(1);
} else {
  console.log('\n=== R2: ALL TESTS PASSED ===');
  process.exit(0);
}
