#!/usr/bin/env node
// AssetSelectionService — ONE_SHOT 和 FOCUS_LOCK 的显式资产选择
var path = require('path'), fs = require('fs'), os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { createAssetSelectionService } = require(path.join(ROOT, 'src', 'admin', 'asset-selection-service'));
var { createAsset } = require(path.join(ROOT, 'src', 'assets', 'asset-model'));

// tmp file 用于 localPath 存在性检查(服务内部用 fs.existsSync)
var tmpDir = path.join(os.tmpdir(), 'sel_' + Date.now()); fs.mkdirSync(tmpDir, { recursive: true });
var realFile = path.join(tmpDir, 'asset.png'); fs.writeFileSync(realFile, 'data');
var missingFile = path.join(tmpDir, 'nope.png');

function mockRepo(assets) {
  return {
    get: function (id) { return Promise.resolve(assets[id] || null); },
    list: function (filter) {
      var all = Object.keys(assets).map(function (k) { return assets[k]; });
      if (!filter) return Promise.resolve(all);
      var r = all.filter(function (a) { for (var k in filter) { if (a[k] !== filter[k]) return false; } return true; });
      return Promise.resolve(r);
    },
  };
}

async function run() {
  // selectForOneShot: 有效资产 → 返回选择(指定 assetId 必须只使用该资产)
  var goodAsset = createAsset({ assetId: 'ast_good', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile });
  var otherAsset = createAsset({ assetId: 'ast_other', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile });
  var svc1 = createAssetSelectionService(mockRepo({ ast_good: goodAsset, ast_other: otherAsset }), null, { info: function () {} });
  var r1 = await svc1.selectForOneShot('LEARNING', 'ast_good');
  t('ONESHOT_VALID_RETURNS_ASSET', r1.assetId === 'ast_good', r1.assetId);
  t('ONESHOT_VALID_LIBRARY_TYPE', r1.libraryType === 'LEARNING', '');
  t('ONESHOT_VALID_HAS_ASSET', r1.asset === goodAsset, '');
  // ONESHOT_EXACT: 指定 assetId 时,即使有其他资产也只使用该 assetId
  t('ONESHOT_EXACT_USES_SPECIFIED_ASSETID', r1.assetId === 'ast_good' && r1.asset !== otherAsset, r1.assetId);

  // selectForOneShot: 不存在资产 → 抛错
  try { await svc1.selectForOneShot('LEARNING', 'missing'); t('ONESHOT_NOT_FOUND_THROWS', false, ''); }
  catch (e) { t('ONESHOT_NOT_FOUND_THROWS', /not found/i.test(e.message), e.message); }

  // selectForOneShot: libraryType 不匹配 → 抛错
  var badType = createAsset({ assetId: 'ast_type', sourceUrl: 'http://x', libraryType: 'CUSTOM', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile });
  var svc2 = createAssetSelectionService(mockRepo({ ast_type: badType }), null, {});
  try { await svc2.selectForOneShot('LEARNING', 'ast_type'); t('ONESHOT_TYPE_MISMATCH_THROWS', false, ''); }
  catch (e) { t('ONESHOT_TYPE_MISMATCH_THROWS', /mismatch/i.test(e.message), e.message); }

  // selectForOneShot: safetyStatus != SAFE → 抛错
  var unsafe = createAsset({ assetId: 'ast_unsafe', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'UNSAFE', lifecycleStatus: 'DISCOVERED', localPath: realFile });
  var svc3 = createAssetSelectionService(mockRepo({ ast_unsafe: unsafe }), null, {});
  try { await svc3.selectForOneShot('LEARNING', 'ast_unsafe'); t('ONESHOT_UNSAFE_THROWS', false, ''); }
  catch (e) { t('ONESHOT_UNSAFE_THROWS', /not safe/i.test(e.message), e.message); }

  // selectForOneShot: lifecycleStatus != SELECTABLE → 抛错
  var notSel = createAsset({ assetId: 'ast_notsel', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'VALIDATED', localPath: realFile });
  var svc4 = createAssetSelectionService(mockRepo({ ast_notsel: notSel }), null, {});
  try { await svc4.selectForOneShot('LEARNING', 'ast_notsel'); t('ONESHOT_NOT_SELECTABLE_THROWS', false, ''); }
  catch (e) { t('ONESHOT_NOT_SELECTABLE_THROWS', /not selectable/i.test(e.message), e.message); }

  // selectForOneShot: localPath 文件不存在 → 抛错
  var noFile = createAsset({ assetId: 'ast_nofile', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: missingFile });
  var svc5 = createAssetSelectionService(mockRepo({ ast_nofile: noFile }), null, {});
  try { await svc5.selectForOneShot('LEARNING', 'ast_nofile'); t('ONESHOT_NO_FILE_THROWS', false, ''); }
  catch (e) { t('ONESHOT_NO_FILE_THROWS', /not found/i.test(e.message), e.message); }

  // selectForOneShot: 缺少 assetId / libraryType → 抛错
  try { await svc1.selectForOneShot('LEARNING', null); t('ONESHOT_NO_ASSETID_THROWS', false, ''); }
  catch (e) { t('ONESHOT_NO_ASSETID_THROWS', /assetId required/i.test(e.message), e.message); }
  try { await svc1.selectForOneShot(null, 'ast_good'); t('ONESHOT_NO_LIBRARYTYPE_THROWS', false, ''); }
  catch (e) { t('ONESHOT_NO_LIBRARYTYPE_THROWS', /libraryType required/i.test(e.message), e.message); }

  // selectForFocusLock: 有匹配资产 → 返回选择(无 theme/albumId 时返回 assets[0])
  var f1 = createAsset({ assetId: 'ast_f1', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile, metadata: { theme: 'night' } });
  var f2 = createAsset({ assetId: 'ast_f2', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile, metadata: { theme: 'day' } });
  var svc6 = createAssetSelectionService(mockRepo({ ast_f1: f1, ast_f2: f2 }), null, {});
  var rf = await svc6.selectForFocusLock({ libraryType: 'LEARNING' });
  t('FOCUS_MATCH_RETURNS', rf.assetId === 'ast_f1' || rf.assetId === 'ast_f2', rf.assetId);
  t('FOCUS_MATCH_LIBRARY_TYPE', rf.libraryType === 'LEARNING', '');

  // FOCUS_NO_THEME_ALBUM_RETURNS_FIRST: 无 theme/albumId → 返回 assets[0](不抛错)
  t('FOCUS_NO_THEME_ALBUM_RETURNS_FIRST', rf.asset === f1 || rf.asset === f2, rf.assetId);

  // selectForFocusLock: 无匹配 → 抛错(不回退到 schedule)
  var svc7 = createAssetSelectionService(mockRepo({}), null, {});
  try { await svc7.selectForFocusLock({ libraryType: 'CUSTOM' }); t('FOCUS_NO_MATCH_THROWS', false, ''); }
  catch (e) { t('FOCUS_NO_MATCH_THROWS', /NO_MATCH/i.test(e.message), e.message); }

  // selectForFocusLock: theme 匹配 → 返回 theme 资产
  var svc8 = createAssetSelectionService(mockRepo({ ast_f1: f1, ast_f2: f2 }), null, {});
  var tf = await svc8.selectForFocusLock({ libraryType: 'LEARNING', theme: 'night' });
  t('FOCUS_THEME_MATCH', tf.assetId === 'ast_f1', tf.assetId);

  // selectForFocusLock: theme 不匹配 → throw NO_MATCH(不回退到 assets[0])
  var svc9 = createAssetSelectionService(mockRepo({ ast_f1: f1, ast_f2: f2 }), null, {});
  try { await svc9.selectForFocusLock({ libraryType: 'LEARNING', theme: 'nonexistent' }); t('FOCUS_THEME_MISS_NO_FALLBACK_THROWS', false, ''); }
  catch (e) { t('FOCUS_THEME_MISS_NO_FALLBACK_THROWS', /NO_MATCH/i.test(e.message), e.message); }

  // selectForFocusLock: albumId 匹配 → 返回 album 资产
  var a1 = createAsset({ assetId: 'ast_a1', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile, metadata: { albumId: 'alb_one' } });
  var a2 = createAsset({ assetId: 'ast_a2', sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: realFile, metadata: { albumId: 'alb_two' } });
  var svcA = createAssetSelectionService(mockRepo({ ast_a1: a1, ast_a2: a2 }), null, {});
  var af = await svcA.selectForFocusLock({ libraryType: 'LEARNING', albumId: 'alb_one' });
  t('FOCUS_ALBUM_MATCH', af.assetId === 'ast_a1', af.assetId);

  // selectForFocusLock: albumId 不匹配 → throw NO_MATCH(不回退到 assets[0])
  var svcB = createAssetSelectionService(mockRepo({ ast_a1: a1, ast_a2: a2 }), null, {});
  try { await svcB.selectForFocusLock({ libraryType: 'LEARNING', albumId: 'alb_missing' }); t('FOCUS_ALBUM_MISS_NO_FALLBACK_THROWS', false, ''); }
  catch (e) { t('FOCUS_ALBUM_MISS_NO_FALLBACK_THROWS', /NO_MATCH/i.test(e.message), e.message); }

  // selectForFocusLock: 缺少 libraryType → 抛错
  try { await svc6.selectForFocusLock({}); t('FOCUS_NO_LIBRARYTYPE_THROWS', false, ''); }
  catch (e) { t('FOCUS_NO_LIBRARYTYPE_THROWS', /libraryType required/i.test(e.message), e.message); }

  // selectForFocusLock: 选中资产 localPath 文件不存在 → 抛错
  var badFile = createAsset({ assetId: 'ast_badfile', sourceUrl: 'http://x', libraryType: 'CUSTOM', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE', localPath: missingFile });
  var svc10 = createAssetSelectionService(mockRepo({ ast_badfile: badFile }), null, {});
  try { await svc10.selectForFocusLock({ libraryType: 'CUSTOM' }); t('FOCUS_NO_FILE_THROWS', false, ''); }
  catch (e) { t('FOCUS_NO_FILE_THROWS', /not found/i.test(e.message), e.message); }

  // selectForFocusLock: 返回值包含 theme 和 albumId
  t('FOCUS_RETURN_HAS_THEME', tf.theme === 'night', tf.theme);
  t('FOCUS_RETURN_HAS_ALBUMID', af.albumId === 'alb_one', af.albumId);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + e.message + '\n' + e.stack); try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e2) {} process.exit(1); });
