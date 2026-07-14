#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };

async function run() {
  var svcNoGate = CLS(
    { storeQuarantine: function() { return '/tmp/q'; }, decodeAndRecompute: function() { return { sha256: 'abc', mimeType: 'image/png', width: 100, height: 100 }; }, moveToAssets: function() { return '/tmp/final'; }, cleanup: function() {} },
    { validate: function() { return { ok: true }; } },
    { isDuplicate: function() { return Promise.resolve(false); } },
    null,
    { create: function() { return Promise.resolve('a1'); } },
    lg
  );
  var result = await svcNoGate.processUpload({ filePath: '/tmp/upload.png', mimeType: 'image/png', width: 100, height: 100 });
  t('NO_SAFETY_GATE_IS_ERROR', result.status === 'ERROR' && result.reason === 'SAFETY_GATE_MISSING', result.status + ':' + result.reason);

  var svcWithGate = CLS(
    { storeQuarantine: function() { return '/tmp/q'; }, decodeAndRecompute: function() { return { sha256: 'abc', mimeType: 'image/png', width: 100, height: 100 }; }, moveToAssets: function() { return '/tmp/final'; }, cleanup: function() {} },
    { validate: function() { return { ok: true }; } },
    { isDuplicate: function() { return Promise.resolve(false); } },
    { isSafe: function() { return true; } },
    { create: function() { return Promise.resolve('a1'); } },
    lg
  );
  var result2 = await svcWithGate.processUpload({ filePath: '/tmp/upload.png', mimeType: 'image/png', width: 100, height: 100 });
  t('HAS_SAFETY_GATE_PROCEEDS', result2.status === 'ACCEPTED', result2.status);
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
