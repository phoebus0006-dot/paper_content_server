#!/usr/bin/env node
// R3.3d: PublicationHistory — append-only history log

var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var PublicationHistory = require(path.join(ROOT, 'src', 'publication', 'publication-history')).PublicationHistory;

var tmpDir = path.join(os.tmpdir(), 'r3_hist_test_' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var histFile = path.join(tmpDir, 'history.json');

var hist = PublicationHistory(histFile);

async function run() {
  // 1. Empty history
  var entries = await hist.list();
  t('EMPTY_LIST', Array.isArray(entries) && entries.length === 0, '');

  // 2. Append entry
  var entry1 = { id: 'e1', type: 'news', frameId: 'news:2026-07-11:test', snapshotId: 'snap_1', publishedAt: new Date().toISOString(), status: 'active' };
  await hist.append(entry1);
  entries = await hist.list();
  t('APPEND_ONE', entries.length === 1 && entries[0].id === 'e1', '');

  // 3. Latest
  var latest = await hist.latest();
  t('LATEST', latest.id === 'e1', '');

  // 4. Append second (newest first)
  var entry2 = { id: 'e2', type: 'photo', frameId: 'photo:test:img', snapshotId: 'snap_2', publishedAt: new Date().toISOString(), status: 'active' };
  await hist.append(entry2);
  entries = await hist.list();
  t('NEWEST_FIRST', entries[0].id === 'e2' && entries[1].id === 'e1', '');

  // 5. Clear
  await hist.clear();
  entries = await hist.list();
  t('CLEAR', entries.length === 0, '');
  var noLatest = await hist.latest();
  t('LATEST_AFTER_CLEAR', noLatest === null, '');

  // 6. Persistence (re-create history with same file)
  await hist.append(entry1);
  var hist2 = PublicationHistory(histFile);
  entries = await hist2.list();
  t('PERSISTENCE', entries.length === 1 && entries[0].id === 'e1', '');

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
