#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };
var fs = require('fs');
var os = require('os');

var cleaned = [];

async function run() {
  var svc = CLS(
    { storeQuarantine: function(buf) { return '/tmp/q'; }, decodeAndRecompute: function() { return Promise.resolve({ sha256: 'abc', mimeType: 'image/png', width: 100, height: 100 }); }, computeSha256Stream: function() { return Promise.resolve('abc'); }, moveToAssets: function() { return '/tmp/final'; }, cleanup: function(p) { cleaned.push(p); } },
    { validate: function() { return { ok: true }; } },
    { isDuplicate: function() { return Promise.resolve(false); } },
    { classify: function() { return Promise.resolve({ score: 0, category: 'safe', modelVersion: 'test', scores: { safe: 1.0 } }); }, isSafe: function(c) { return c && c.score !== undefined && c.score < 0.5; }, audit: function() { return Promise.resolve(); } },
    null,
    lg
  );
  var result = await svc.processUpload({ fileBuffer: Buffer.from('img'), mimeType: 'image/png', width: 100, height: 100 });
  t('MISSING_REPOSITORY_ERROR', result.status === 'ERROR' && result.reason === 'ASSET_REPOSITORY_MISSING', result.status + ':' + result.reason);
  t('CLEANED_FINAL_ORPHAN', cleaned.length > 0, 'cleaned=' + JSON.stringify(cleaned));
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
