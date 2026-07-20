#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var ADS = require(path.join(ROOT, 'src', 'safety', 'asset-delete-service')).AssetDeleteService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };

async function run() {
  var calls = [];
  var svc = ADS(
    { get: function() { return Promise.resolve({ assetId: 'a1', lifecycleStatus: 'ACTIVE', safetyStatus: 'UNSAFE', localPath: '/tmp/test.jpg' }); },
      markBlocked: function() { return Promise.resolve(); }, markTombstoned: function() { return Promise.resolve(); } },
    { findReferences: function() { return Promise.resolve({ complete: true, references: [{ type: 'active_snapshot', snapshotId: 's1' }] }); } },
    { readActive: function() { return Promise.resolve(null); }, load: function() { return Promise.resolve(null); } },
    null, null, null, { append: function() { return Promise.resolve(); } },
    { cleanCache: function() { return { complete: true }; }, cleanLegacyIndexes: function() { return { complete: true, legacyIndexCleaned: true, overrideCleaned: true, errors: [] }; }, isPathAllowed: function() { return true; } },
    lg,
    function() { calls.push('findSafeReplacement'); return Promise.resolve(null); },
    function() { calls.push('publishReplacement'); return Promise.resolve(); }
  );

  var result = await svc.deleteUnsafeAsset({ assetId: 'a1', reason: 'UNSAFE', decision: 'remove', dryRun: false });
  t('SHORT_CIRCUIT_ON_NO_SAFE_REPLACEMENT', result.stage === 'REPLACEMENT' && result.reason === 'NO_SAFE_REPLACEMENT', result.stage + ':' + result.reason);
  t('NO_CLEANUP_AFTER_SHORT_CIRCUIT', calls.length === 1, 'calls=' + JSON.stringify(calls));

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
