#!/usr/bin/env node
// R1.6: JsonStore with explicit error semantics
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var JsonStore = require(path.join(ROOT, 'src', 'infra', 'json-store')).JsonStore;
var ERR = require(path.join(ROOT, 'src', 'infra', 'json-store'));

t('JSON_STORE_EXISTS', typeof JsonStore === 'function', '');
t('ERROR_CONSTANTS', ERR.ERR_NOT_FOUND === 'NOT_FOUND' && ERR.ERR_INVALID_JSON === 'INVALID_JSON' && ERR.ERR_IO === 'IO_ERROR', '');

var tmpDir = path.join(os.tmpdir(), 'r1_js_test_' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

async function run() {
  // 1. Read non-existent file
  var store = JsonStore(path.join(tmpDir, 'nonexistent.json'));
  try { await store.read(); t('READ_NOT_FOUND_SHOULD_FAIL', false, ''); }
  catch(e) { t('READ_NOT_FOUND', e.code === 'NOT_FOUND', e.code); }

  // 2. ReadOrNull on non-existent
  var r = await store.readOrNull();
  t('READ_OR_NULL', r === null, '');

  // 3. Write and read
  var store2 = JsonStore(path.join(tmpDir, 'valid.json'));
  await store2.write({ key: 'value', schemaVersion: 1 });
  var data = await store2.read();
  t('WRITE_READ', data.key === 'value', data.key);

  // 4. Corrupt file
  fs.writeFileSync(path.join(tmpDir, 'corrupt.json'), 'not json{{{');
  var store3 = JsonStore(path.join(tmpDir, 'corrupt.json'));
  try { await store3.read(); t('CORRUPT_SHOULD_FAIL', false, ''); }
  catch(e) { t('CORRUPT_INVALID_JSON', e.code === 'INVALID_JSON', e.code); }

  // Cleanup
  fs.rmdirSync(tmpDir, { recursive: true });
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(err) {
  console.log('CRASH: ' + err.message);
  try { fs.rmdirSync(tmpDir, { recursive: true }); } catch(e) {}
  process.exit(1);
});
