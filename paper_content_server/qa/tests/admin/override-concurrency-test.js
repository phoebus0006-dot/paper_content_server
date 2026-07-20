#!/usr/bin/env node
// override-concurrency-test.js — Lane F: collision-safe atomic override writes
//
// Verifies the F1 fix to src/admin/override-persistence.js:
//   - CONCURRENT_WRITES_NO_COLLISION: 10 concurrent writers (real child
//     processes) all complete; final file is valid + one of the 10 ids;
//     no .tmp.* litter left behind.
//   - ATOMIC_RENAME: after a clean write, stateFile exists with the right
//     content and no tmp leftover.
//   - TEMP_CLEANUP_ON_FAILURE: when rename fails after the tmp file is
//     created, the tmp file is unlinked.
//   - CORRUPT_QUARANTINE: truncated JSON -> loadOverride returns null AND
//     the corrupt file is moved to .corrupt.<ts>.
//   - SCHEMA_VERSION: valid JSON but wrong schemaVersion -> null + quarantined.
//   - LAST_COMPLETE_WRITE_READABLE: a clean write round-trips through
//     loadOverride with all fields preserved.
var path = require('path');
var fs = require('fs');
var os = require('os');
var { spawn } = require('child_process');

var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { createOverridePersistence } = require(path.join(ROOT, 'src', 'admin', 'override-persistence'));

var tmpDir = path.join(os.tmpdir(), 'ovr_conc_' + Date.now() + '_' + process.pid);
fs.mkdirSync(tmpDir, { recursive: true });
var stateFile = path.join(tmpDir, 'admin_override.json');

// Spawn a child Node process that calls saveOverride(state) and exits.
// True parallel execution (separate processes) is the only way to exercise
// the collision-safe tmp filename fix from a single test driver —
// saveOverride is synchronous, so within one process calls serialize.
function spawnWriter(id, file) {
  return new Promise(function (resolve) {
    // Pass the full state as a JSON literal to avoid string-concat escaping bugs.
    var stateArg = JSON.stringify({
      mode: 'ONE_SHOT',
      assetId: id,
      snapshotId: 'snap_' + id,
      libraryType: 'LEARNING',
      savedAt: '2026-07-13T0' + id.slice(-1) + ':00:00.000Z',
    });
    var script =
      'var path = require("path");\n' +
      'var ROOT = ' + JSON.stringify(ROOT) + ';\n' +
      'var { createOverridePersistence } = require(path.join(ROOT, "src", "admin", "override-persistence"));\n' +
      'var persist = createOverridePersistence(' + JSON.stringify(file) + ', { info: function(){}, warn: function(){} });\n' +
      'try {\n' +
      '  persist.saveOverride(' + stateArg + ');\n' +
      '  process.exit(0);\n' +
      '} catch (e) { console.error(e.message); process.exit(1); }\n';
    var child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    var stderr = '';
    child.stderr.on('data', function (d) { stderr += d.toString(); });
    child.on('exit', function (code) { resolve({ ok: code === 0, err: stderr }); });
    child.on('error', function (e) { resolve({ ok: false, err: e.message }); });
  });
}

async function run() {
  var persist = createOverridePersistence(stateFile, { info: function () {}, warn: function () {} });

  // --- CONCURRENT_WRITES_NO_COLLISION ---
  // 10 real child processes writing to the same stateFile in parallel. With
  // the F1 fix each writer gets a unique tmp path; the final file must be
  // valid JSON with schemaVersion=1, contain one of the 10 written assetIds
  // (whichever rename completed last), and leave no .tmp.* leftovers.
  var ids = [];
  for (var i = 0; i < 10; i++) ids.push('ast_conc_' + i);
  var results = await Promise.all(ids.map(function (id) { return spawnWriter(id, stateFile); }));
  var allOk = results.every(function (r) { return r.ok; });
  var errs = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.err; });
  var finalState = persist.loadOverride();
  var tmpLeftovers = fs.readdirSync(tmpDir).filter(function (n) { return /\.tmp\./.test(n); });
  t('CONCURRENT_WRITES_NO_COLLISION',
    allOk &&
    finalState !== null &&
    ids.indexOf(finalState.assetId) >= 0 &&
    finalState.schemaVersion === 1 &&
    tmpLeftovers.length === 0,
    'allOk=' + allOk +
    ' assetId=' + (finalState && finalState.assetId) +
    ' schemaVersion=' + (finalState && finalState.schemaVersion) +
    ' tmpLeftovers=' + tmpLeftovers.length +
    (errs.length ? ' errs=' + errs.join(';') : ''));

  // --- ATOMIC_RENAME ---
  // A single clean write must produce the state file with the right content
  // and leave no tmp file behind.
  persist.saveOverride({ mode: 'ONE_SHOT', assetId: 'ast_atomic', snapshotId: 'snap_atomic', libraryType: 'LEARNING', savedAt: '2026-07-13T02:00:00.000Z' });
  var atomicRaw = fs.readFileSync(stateFile, 'utf8');
  var atomicParsed = JSON.parse(atomicRaw);
  var atomicLoaded = persist.loadOverride();
  var atomicTmpLeftovers = fs.readdirSync(tmpDir).filter(function (n) { return /\.tmp\./.test(n); });
  t('ATOMIC_RENAME',
    fs.existsSync(stateFile) &&
    atomicTmpLeftovers.length === 0 &&
    atomicParsed.assetId === 'ast_atomic' &&
    atomicParsed.schemaVersion === 1 &&
    atomicLoaded && atomicLoaded.assetId === 'ast_atomic' && atomicLoaded.schemaVersion === 1,
    'exists=' + fs.existsSync(stateFile) +
    ' tmpLeftovers=' + atomicTmpLeftovers.length +
    ' parsedAsset=' + atomicParsed.assetId +
    ' loadedAsset=' + (atomicLoaded && atomicLoaded.assetId));

  // --- TEMP_CLEANUP_ON_FAILURE ---
  // Stub fs.renameSync to throw so saveOverride fails AFTER the tmp file has
  // been created (openSync('wx') + writeFileSync + fsync + close all succeed,
  // then rename throws). The catch block must unlink the tmp file. We restore
  // the original fs.renameSync immediately after the saveOverride attempt.
  // Stubbing is safe here because saveOverride is synchronous and we restore
  // before any other code runs.
  var origRenameSync = fs.renameSync;
  var renameCalled = false;
  fs.renameSync = function (from, to) {
    renameCalled = true;
    var err = new Error('simulated rename failure (test stub)');
    err.code = 'EACCES';
    throw err;
  };
  var stubThrew = false;
  var stubErr = null;
  try {
    persist.saveOverride({ mode: 'ONE_SHOT', assetId: 'ast_stub', snapshotId: 'snap_s', libraryType: 'LEARNING', savedAt: '2026-07-13T03:00:00.000Z' });
  } catch (e) {
    stubThrew = true;
    stubErr = e;
  }
  fs.renameSync = origRenameSync;
  var stubLeftovers = fs.readdirSync(tmpDir).filter(function (n) { return /\.tmp\./.test(n); });
  t('TEMP_CLEANUP_ON_FAILURE',
    stubThrew && renameCalled && stubLeftovers.length === 0,
    'threw=' + stubThrew +
    ' renameCalled=' + renameCalled +
    ' err=' + (stubErr && stubErr.message) +
    ' leftovers=' + stubLeftovers.length);

  // --- CORRUPT_QUARANTINE ---
  // Truncated JSON -> loadOverride returns null AND the corrupt file is moved
  // aside to a .corrupt.<ts> path so we do not silently re-read broken state.
  persist.saveOverride({ mode: 'ONE_SHOT', assetId: 'ast_pre_corrupt', snapshotId: 'snap_pc', libraryType: 'LEARNING', savedAt: '2026-07-13T04:00:00.000Z' });
  fs.writeFileSync(stateFile, '{ "mode": "ONE_SHOT", "assetId": "ast_corrupt",');
  var corruptBefore = fs.readdirSync(tmpDir).filter(function (n) { return /\.corrupt\./.test(n); }).length;
  var corruptLoaded = persist.loadOverride();
  var corruptAfter = fs.readdirSync(tmpDir).filter(function (n) { return /\.corrupt\./.test(n); });
  t('CORRUPT_QUARANTINE',
    corruptLoaded === null &&
    !fs.existsSync(stateFile) &&
    corruptAfter.length === corruptBefore + 1,
    'loaded=' + corruptLoaded +
    ' originalExists=' + fs.existsSync(stateFile) +
    ' corruptFiles=' + corruptAfter.length + ' (before=' + corruptBefore + ')');
  // cleanup quarantined files
  corruptAfter.forEach(function (n) { try { fs.unlinkSync(path.join(tmpDir, n)); } catch (e) {} });

  // --- SCHEMA_VERSION ---
  // Valid JSON but wrong schemaVersion -> null + quarantined.
  fs.writeFileSync(stateFile, JSON.stringify({ mode: 'ONE_SHOT', assetId: 'ast_schema', schemaVersion: 99 }));
  var svBefore = fs.readdirSync(tmpDir).filter(function (n) { return /\.corrupt\./.test(n); }).length;
  var svLoaded = persist.loadOverride();
  var svAfter = fs.readdirSync(tmpDir).filter(function (n) { return /\.corrupt\./.test(n); });
  t('SCHEMA_VERSION',
    svLoaded === null &&
    !fs.existsSync(stateFile) &&
    svAfter.length === svBefore + 1,
    'loaded=' + svLoaded +
    ' originalExists=' + fs.existsSync(stateFile) +
    ' corruptFiles=' + svAfter.length + ' (before=' + svBefore + ')');
  svAfter.forEach(function (n) { try { fs.unlinkSync(path.join(tmpDir, n)); } catch (e) {} });

  // --- LAST_COMPLETE_WRITE_READABLE ---
  // A clean write round-trips through loadOverride with all fields preserved
  // (including schemaVersion injected by saveOverride).
  persist.saveOverride({ mode: 'FOCUS_LOCK', assetId: 'ast_last', snapshotId: 'snap_last', libraryType: 'CUSTOM', theme: 'night', albumId: 'album_1', savedAt: '2026-07-13T05:00:00.000Z' });
  var lastLoaded = persist.loadOverride();
  t('LAST_COMPLETE_WRITE_READABLE',
    lastLoaded !== null &&
    lastLoaded.mode === 'FOCUS_LOCK' &&
    lastLoaded.assetId === 'ast_last' &&
    lastLoaded.snapshotId === 'snap_last' &&
    lastLoaded.libraryType === 'CUSTOM' &&
    lastLoaded.theme === 'night' &&
    lastLoaded.albumId === 'album_1' &&
    lastLoaded.savedAt === '2026-07-13T05:00:00.000Z' &&
    lastLoaded.schemaVersion === 1,
    lastLoaded ? JSON.stringify(lastLoaded) : 'null');

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function (e) {
  console.log('CRASH: ' + e.message + '\n' + e.stack);
  // Best-effort restore in case the stub leak happened before the crash.
  try { fs.renameSync = require('fs').renameSync; } catch (e2) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
