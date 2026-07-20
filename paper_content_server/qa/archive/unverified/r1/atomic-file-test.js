#!/usr/bin/env node
// R1.5: Atomic file write test
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var writeFileAtomic = require(path.join(ROOT, 'src', 'infra', 'atomic-file')).writeFileAtomic;
t('FN_EXISTS', typeof writeFileAtomic === 'function', '');

var tmpDir = path.join(os.tmpdir(), 'r1_atomic_test_' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var testFile = path.join(tmpDir, 'test.json');

// Write and read back
writeFileAtomic(testFile, JSON.stringify({ hello: 'world' })).then(function() {
  t('WRITE_SUCCESS', true, '');
  var data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  t('READ_BACK', data.hello === 'world', data.hello);
  // Cleanup
  fs.unlinkSync(testFile);
  fs.rmdirSync(tmpDir);
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(err) {
  t('WRITE_FAILED', false, err.message);
  try { fs.unlinkSync(testFile); } catch(e) {}
  try { fs.rmdirSync(tmpDir); } catch(e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(1);
});
