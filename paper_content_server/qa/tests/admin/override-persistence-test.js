#!/usr/bin/env node
// override-persistence-test.js — ONE_SHOT/FOCUS_LOCK override 持久化测试
var path = require('path'), fs = require('fs'), os = require('os');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { createOverridePersistence } = require(path.join(ROOT, 'src', 'admin', 'override-persistence'));
var { createAsset } = require(path.join(ROOT, 'src', 'assets', 'asset-model'));

// tmp dir 用于 stateFile 和 localPath
var tmpDir = path.join(os.tmpdir(), 'ovr_' + Date.now()); fs.mkdirSync(tmpDir, { recursive: true });
var stateFile = path.join(tmpDir, 'override.json');
var realFile = path.join(tmpDir, 'asset.png'); fs.writeFileSync(realFile, 'data');
var missingFile = path.join(tmpDir, 'nope.png');

function mockRepo(assets) {
  return {
    get: function (id) { return Promise.resolve(assets[id] || null); },
  };
}

async function run() {
  var persist = createOverridePersistence(stateFile, { info: function () {}, warn: function () {} });

  // --- saveOverride + loadOverride 往返 ---
  // 文件不存在 → loadOverride 返回 null
  var empty = persist.loadOverride();
  t('LOAD_OVERRIDE_NULL_WHEN_ABSENT', empty === null, String(empty));

  // 保存后加载应等价
  var state = { mode: 'ONE_SHOT', assetId: 'ast_good', snapshotId: 'snap_1', libraryType: 'LEARNING', savedAt: '2026-07-13T00:00:00.000Z' };
  persist.saveOverride(state);
  var loaded = persist.loadOverride();
  t('SAVE_LOAD_ROUNDTRIP_MODE', loaded.mode === 'ONE_SHOT', loaded.mode);
  t('SAVE_LOAD_ROUNDTRIP_ASSETID', loaded.assetId === 'ast_good', loaded.assetId);
  t('SAVE_LOAD_ROUNDTRIP_SNAPSHOTID', loaded.snapshotId === 'snap_1', loaded.snapshotId);
  t('SAVE_LOAD_ROUNDTRIP_LIBRARYTYPE', loaded.libraryType === 'LEARNING', loaded.libraryType);
  t('SAVE_LOAD_ROUNDTRIP_SAVEDAT', loaded.savedAt === '2026-07-13T00:00:00.000Z', loaded.savedAt);

  // stateFile 应实际写入磁盘
  t('STATE_FILE_EXISTS_ON_DISK', fs.existsSync(stateFile), '');

  // --- clearOverride ---
  persist.clearOverride();
  t('CLEAR_OVERRIDE_REMOVES_FILE', !fs.existsSync(stateFile), String(fs.existsSync(stateFile)));
  t('CLEAR_OVERRIDE_LOAD_RETURNS_NULL', persist.loadOverride() === null, '');

  // clearOverride 在文件不存在时不应抛错(幂等)
  var clearErr = null;
  try { persist.clearOverride(); } catch (e) { clearErr = e; }
  t('CLEAR_OVERRIDE_IDEMPOTENT', clearErr === null, clearErr && clearErr.message);

  // --- validateOverrideAsync: 资产仍安全/可选/文件存在 → valid=true ---
  var goodAsset = createAsset({ assetId: 'ast_good', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile });
  var repoGood = mockRepo({ ast_good: goodAsset });
  var vGood = await persist.validateOverrideAsync({ assetId: 'ast_good', libraryType: 'LEARNING' }, repoGood);
  t('VALIDATE_VALID_RETURNS_TRUE', vGood.valid === true, JSON.stringify(vGood));
  t('VALIDATE_VALID_HAS_ASSET', vGood.asset === goodAsset, '');
  t('VALIDATE_VALID_NO_REASON', vGood.reason === undefined, String(vGood.reason));

  // --- validateOverrideAsync: 资产不存在 → valid=false ---
  var repoMissing = mockRepo({});
  var vMissing = await persist.validateOverrideAsync({ assetId: 'ast_missing', libraryType: 'LEARNING' }, repoMissing);
  t('VALIDATE_ASSET_NOT_FOUND', vMissing.valid === false, JSON.stringify(vMissing));
  t('VALIDATE_ASSET_NOT_FOUND_REASON', vMissing.reason === 'ASSET_NOT_FOUND', vMissing.reason);

  // --- validateOverrideAsync: 资产 unsafe → valid=false ---
  var unsafeAsset = createAsset({ assetId: 'ast_unsafe', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'UNSAFE', lifecycleStatus: 'DISCOVERED', localPath: realFile });
  var repoUnsafe = mockRepo({ ast_unsafe: unsafeAsset });
  var vUnsafe = await persist.validateOverrideAsync({ assetId: 'ast_unsafe' }, repoUnsafe);
  t('VALIDATE_UNSAFE_INVALID', vUnsafe.valid === false, JSON.stringify(vUnsafe));
  t('VALIDATE_UNSAFE_REASON', vUnsafe.reason === 'ASSET_NOT_SAFE', vUnsafe.reason);
  t('VALIDATE_UNSAFE_CURRENT', vUnsafe.current === 'UNSAFE', vUnsafe.current);

  // --- validateOverrideAsync: 资产非 SELECTABLE → valid=false ---
  var notSelAsset = createAsset({ assetId: 'ast_notsel', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'VALIDATED', localPath: realFile });
  var repoNotSel = mockRepo({ ast_notsel: notSelAsset });
  var vNotSel = await persist.validateOverrideAsync({ assetId: 'ast_notsel' }, repoNotSel);
  t('VALIDATE_NOT_SELECTABLE_INVALID', vNotSel.valid === false, JSON.stringify(vNotSel));
  t('VALIDATE_NOT_SELECTABLE_REASON', vNotSel.reason === 'ASSET_NOT_SELECTABLE', vNotSel.reason);

  // --- validateOverrideAsync: 文件不存在 → valid=false ---
  var noFileAsset = createAsset({ assetId: 'ast_nofile', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: missingFile });
  var repoNoFile = mockRepo({ ast_nofile: noFileAsset });
  var vNoFile = await persist.validateOverrideAsync({ assetId: 'ast_nofile' }, repoNoFile);
  t('VALIDATE_LOCAL_FILE_MISSING', vNoFile.valid === false, JSON.stringify(vNoFile));
  t('VALIDATE_LOCAL_FILE_MISSING_REASON', vNoFile.reason === 'LOCAL_FILE_MISSING', vNoFile.reason);
  t('VALIDATE_LOCAL_FILE_MISSING_PATH', vNoFile.path === missingFile, vNoFile.path);

  // --- validateOverrideAsync: libraryType 不匹配 → valid=false ---
  var mismatchAsset = createAsset({ assetId: 'ast_mismatch', sourceUrl: 'http://x', libraryType: 'CUSTOM', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile });
  var repoMismatch = mockRepo({ ast_mismatch: mismatchAsset });
  var vMismatch = await persist.validateOverrideAsync({ assetId: 'ast_mismatch', libraryType: 'LEARNING' }, repoMismatch);
  t('VALIDATE_LIBRARY_TYPE_MISMATCH', vMismatch.valid === false, JSON.stringify(vMismatch));
  t('VALIDATE_LIBRARY_TYPE_MISMATCH_REASON', vMismatch.reason === 'LIBRARY_TYPE_MISMATCH', vMismatch.reason);
  t('VALIDATE_LIBRARY_TYPE_MISMATCH_EXPECTED', vMismatch.expected === 'LEARNING', vMismatch.expected);
  t('VALIDATE_LIBRARY_TYPE_MISMATCH_ACTUAL', vMismatch.actual === 'CUSTOM', vMismatch.actual);

  // --- validateOverrideAsync: 缺少 assetId → valid=false ---
  var vNoId = await persist.validateOverrideAsync({}, repoGood);
  t('VALIDATE_NO_ASSET_ID', vNoId.valid === false, JSON.stringify(vNoId));
  t('VALIDATE_NO_ASSET_ID_REASON', vNoId.reason === 'NO_ASSET_ID', vNoId.reason);

  // --- validateOverrideAsync: state 为 null → valid=false ---
  var vNull = await persist.validateOverrideAsync(null, repoGood);
  t('VALIDATE_NULL_STATE', vNull.valid === false, JSON.stringify(vNull));
  t('VALIDATE_NULL_STATE_REASON', vNull.reason === 'NO_ASSET_ID', vNull.reason);

  // --- 模拟 restart restore 流程: save → load → validate ---
  persist.saveOverride({ mode: 'FOCUS_LOCK', assetId: 'ast_good', snapshotId: 'snap_2', libraryType: 'LEARNING', theme: 'night', savedAt: '2026-07-13T01:00:00.000Z' });
  var restored = persist.loadOverride();
  var revalidated = await persist.validateOverrideAsync(restored, repoGood);
  t('RESTART_RESTORE_VALID', revalidated.valid === true, JSON.stringify(revalidated));
  t('RESTART_RESTORE_ASSETID', restored.assetId === 'ast_good', restored.assetId);
  // 清理
  persist.clearOverride();
  t('RESTART_RESTORE_CLEARED', persist.loadOverride() === null, '');

  // --- ATOMIC_WRITE_USES_RENAME ---
  // saveOverride must: produce the state file, leave no .tmp behind,
  // write schemaVersion=1, and round-trip through loadOverride.
  persist.saveOverride({ mode: 'ONE_SHOT', assetId: 'ast_atomic', snapshotId: 'snap_atomic', libraryType: 'LEARNING', savedAt: '2026-07-13T02:00:00.000Z' });
  var atomicRaw = fs.readFileSync(stateFile, 'utf8');
  var atomicParsed = JSON.parse(atomicRaw);
  var atomicLoaded = persist.loadOverride();
  t('ATOMIC_WRITE_USES_RENAME',
    fs.existsSync(stateFile) &&
    !fs.existsSync(stateFile + '.tmp') &&
    atomicParsed.mode === 'ONE_SHOT' &&
    atomicParsed.assetId === 'ast_atomic' &&
    atomicParsed.schemaVersion === 1 &&
    atomicLoaded && atomicLoaded.mode === 'ONE_SHOT' && atomicLoaded.schemaVersion === 1,
    'exists=' + fs.existsSync(stateFile) + ' tmp=' + fs.existsSync(stateFile + '.tmp') +
    ' sv=' + (atomicParsed.schemaVersion) + ' loaded=' + (atomicLoaded ? atomicLoaded.mode : 'null'));
  persist.clearOverride();

  // --- CORRUPT_FILE_QUARANTINED ---
  // Truncated JSON: loadOverride returns null AND the corrupt file is moved
  // aside to .corrupt.<ts> so we do not silently re-read broken state.
  fs.writeFileSync(stateFile, '{ "mode": "ONE_SHOT", "assetId": "ast_corrupt",');
  var corruptBefore = fs.readdirSync(tmpDir).filter(function (n) { return n.indexOf('.corrupt.') >= 0; }).length;
  var corruptLoaded = persist.loadOverride();
  var corruptAfter = fs.readdirSync(tmpDir).filter(function (n) { return n.indexOf('.corrupt.') >= 0; });
  t('CORRUPT_FILE_QUARANTINED',
    corruptLoaded === null &&
    !fs.existsSync(stateFile) &&
    corruptAfter.length === corruptBefore + 1,
    'loaded=' + corruptLoaded + ' originalExists=' + fs.existsSync(stateFile) +
    ' corruptFiles=' + corruptAfter.length + ' (before=' + corruptBefore + ')');
  // Re-load must NOT find the corrupt content again (it was moved aside)
  t('CORRUPT_FILE_QUARANTINED_NO_RELID', persist.loadOverride() === null, '');
  // cleanup quarantined files
  corruptAfter.forEach(function (n) { try { fs.unlinkSync(path.join(tmpDir, n)); } catch (e) { /* best-effort */ } });

  // --- SCHEMA_VERSION_CHECKED ---
  // Valid JSON but wrong schemaVersion -> null + quarantined.
  fs.writeFileSync(stateFile, JSON.stringify({ mode: 'ONE_SHOT', assetId: 'ast_schema', schemaVersion: 99 }));
  var svBefore = fs.readdirSync(tmpDir).filter(function (n) { return n.indexOf('.corrupt.') >= 0; }).length;
  var svLoaded = persist.loadOverride();
  var svAfter = fs.readdirSync(tmpDir).filter(function (n) { return n.indexOf('.corrupt.') >= 0; });
  t('SCHEMA_VERSION_CHECKED',
    svLoaded === null && !fs.existsSync(stateFile) && svAfter.length === svBefore + 1,
    'loaded=' + svLoaded + ' originalExists=' + fs.existsSync(stateFile) +
    ' corruptFiles=' + svAfter.length + ' (before=' + svBefore + ')');
  svAfter.forEach(function (n) { try { fs.unlinkSync(path.join(tmpDir, n)); } catch (e) { /* best-effort */ } });

  // Missing schemaVersion (legacy/old format) is also rejected.
  fs.writeFileSync(stateFile, JSON.stringify({ mode: 'ONE_SHOT', assetId: 'ast_old' }));
  var oldLoaded = persist.loadOverride();
  t('SCHEMA_VERSION_CHECKED_MISSING_VERSION_REJECTED', oldLoaded === null, String(oldLoaded));
  try { if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile); } catch (e) { /* best-effort */ }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + e.message + '\n' + e.stack); try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e2) {} process.exit(1); });
