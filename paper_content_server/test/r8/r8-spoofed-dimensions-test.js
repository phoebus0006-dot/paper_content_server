#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };

var createdAsset = null;

async function run() {
  var svc = CLS(
    { storeQuarantine: function() { return '/tmp/q'; }, decodeAndRecompute: function() { return { sha256: 'real_sha', mimeType: 'image/png', width: 640, height: 480 }; }, moveToAssets: function() { return '/tmp/final'; }, cleanup: function() {} },
    { validate: function() { return { ok: true }; } },
    { isDuplicate: function() { return Promise.resolve(false); } },
    { isSafe: function() { return true; } },
    { create: function(asset) { createdAsset = asset; return Promise.resolve(asset.assetId); } },
    lg
  );
  var result = await svc.processUpload({ filePath: '/tmp/upload.png', mimeType: 'image/png', width: 9999, height: 9999 });
  t('USES_DECODED_WIDTH', createdAsset && createdAsset.width === 640, createdAsset ? 'width=' + createdAsset.width : 'no asset');
  t('USES_DECODED_HEIGHT', createdAsset && createdAsset.height === 480, createdAsset ? 'height=' + createdAsset.height : 'no asset');
  t('USES_DECODED_SHA256', createdAsset && createdAsset.sha256 === 'real_sha', '');
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
