#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var ADS = require(path.join(ROOT, 'src', 'safety', 'asset-delete-service')).AssetDeleteService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };
var tmp = path.join(os.tmpdir(), 'r4_htf_' + Date.now());
fs.mkdirSync(tmp, { recursive: true });

var updated = [];
var testFile = path.join(tmp, 'test.jpg');
fs.writeFileSync(testFile, 'content');

async function run() {
  var svc = ADS(
    { get: function() { return Promise.resolve({ assetId: 'a1', lifecycleStatus: 'ACTIVE', safetyStatus: 'UNSAFE', localPath: testFile }); },
      markBlocked: function() { return Promise.resolve(); }, markTombstoned: function() { return Promise.resolve(); } },
    { findReferences: function() { return Promise.resolve({ complete: true, references: [
      { type: 'publication_history', snapshotId: 's_pub' },
      { type: 'rollback_snapshot', snapshotId: 's_roll' },
      { type: 'cache', snapshotId: 's_cache' },
      { type: 'legacy_index', snapshotId: 's_leg' },
      { type: 'admin_override', snapshotId: 's_adm' },
    ] }); } },
    { readActive: function() { return Promise.resolve(null); }, load: function() { return Promise.resolve(null); } },
    null,
    { update: function(sid) { updated.push(sid); return Promise.resolve(); } },
    { write: function() { return Promise.resolve(); } },
    { append: function() { return Promise.resolve(); } },
    { cleanCache: function() { return { complete: true }; }, cleanLegacyIndexes: function() { return { complete: true, legacyIndexCleaned: true, overrideCleaned: true, errors: [] }; }, isPathAllowed: function() { return true; } },
    lg,
    null, null
  );

  var result = await svc.deleteUnsafeAsset({ assetId: 'a1', reason: 'UNSAFE', decision: 'remove', dryRun: false });
  t('DELETE_COMPLETED', result.complete, result.stage || '' + result.reason || '');
  t('HISTORY_UPDATED_FOR_PUBLICATION', updated.indexOf('s_pub') >= 0, 'updated=' + JSON.stringify(updated));
  t('HISTORY_UPDATED_FOR_ROLLBACK', updated.indexOf('s_roll') >= 0, '');
  t('HISTORY_NOT_UPDATED_FOR_CACHE', updated.indexOf('s_cache') < 0, '');
  t('HISTORY_NOT_UPDATED_FOR_LEGACY', updated.indexOf('s_leg') < 0, '');
  t('HISTORY_NOT_UPDATED_FOR_ADMIN', updated.indexOf('s_adm') < 0, '');
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  try { fs.rmdirSync(tmp, { recursive: true }); } catch(e) {}
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
