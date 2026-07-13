#!/usr/bin/env node
// AssetDeleteService — 完整删除管道:reference check → tombstone → cleanup → audit
// Fail-closed: 任一步失败,后续步骤不执行
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { createAssetDeleteService } = require(path.join(ROOT, 'src', 'assets', 'asset-delete-service'));
var { createAsset } = require(path.join(ROOT, 'src', 'assets', 'asset-model'));
var { canDelete } = require(path.join(ROOT, 'src', 'safety', 'safety-decision'));

function uid(p) { return p + Math.random().toString(36).slice(2, 8); }
function makeUnsafeAsset() {
  return createAsset({ assetId: uid('ast_del_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'UNSAFE', lifecycleStatus: 'DISCOVERED' });
}
function makeSafeAsset() {
  return createAsset({ assetId: uid('ast_safe_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' });
}

function mockRepo(asset) {
  return {
    asset: asset,
    markTombstonedCalls: [],
    markTombstonedFails: false,
    get: function (id) { return Promise.resolve(id === this.asset.assetId ? this.asset : null); },
    markTombstoned: function (id, reason) {
      this.markTombstonedCalls.push({ id: id, reason: reason });
      if (this.markTombstonedFails) return Promise.reject(new Error('markTombstoned boom'));
      return Promise.resolve();
    },
  };
}
function mockRefIndex(refs) {
  return { refs: refs || [], getReferences: function (id) { return Promise.resolve(this.refs); } };
}
function mockTombstone() {
  return {
    records: [],
    recordFails: false,
    record: function (id, data) {
      if (this.recordFails) return Promise.reject(new Error('tombstone boom'));
      this.records.push({ id: id, data: data });
      return Promise.resolve();
    },
  };
}
function mockAudit() {
  return { entries: [], record: function (e) { this.entries.push(e); return Promise.resolve(); } };
}
function mockCleaner() {
  return { cleaned: [], cleanForAsset: function (id) { this.cleaned.push(id); return Promise.resolve(); } };
}

async function run() {
  // sanity: canDelete 行为符合预期
  t('SANITY_CAN_DELETE_UNSAFE', canDelete(makeUnsafeAsset(), 'UNSAFE') === true, '');
  t('SANITY_CANNOT_DELETE_SAFE', canDelete(makeSafeAsset(), 'UNSAFE') === false, '');

  // 1. deleteAsset: 有效 UNSAFE 资产 → 删除成功
  var a1 = makeUnsafeAsset();
  var r1 = mockRepo(a1), ts1 = mockTombstone(), au1 = mockAudit(), cl1 = mockCleaner(), ri1 = mockRefIndex([]);
  var svc1 = createAssetDeleteService(r1, ri1, ts1, au1, cl1, { info: function () {} });
  var res1 = await svc1.deleteAsset(a1.assetId, 'UNSAFE');
  t('DELETE_VALID_STATUS', res1.status === 'DELETED', res1.status);
  t('DELETE_VALID_ID', res1.assetId === a1.assetId, '');
  t('DELETE_VALID_REASON', res1.reason === 'UNSAFE', '');
  t('DELETE_VALID_MARKED_TOMBSTONED', r1.markTombstonedCalls.length === 1 && r1.markTombstonedCalls[0].id === a1.assetId, '');
  t('DELETE_VALID_CLEANER_CALLED', cl1.cleaned.length === 1 && cl1.cleaned[0] === a1.assetId, '');

  // 5. deleteAsset: tombstone 记录
  t('DELETE_TOMBSTONE_RECORDED', ts1.records.length === 1 && ts1.records[0].id === a1.assetId, '');
  t('DELETE_TOMBSTONE_REASON', ts1.records[0].data.reason === 'UNSAFE', '');
  t('DELETE_TOMBSTONE_DELETEDAT', typeof ts1.records[0].data.deletedAt === 'string', '');

  // 6. deleteAsset: audit log 记录
  t('DELETE_AUDIT_RECORDED', au1.entries.length === 1, '');
  t('DELETE_AUDIT_ACTION', au1.entries[0].action === 'DELETE', '');
  t('DELETE_AUDIT_ASSET_ID', au1.entries[0].assetId === a1.assetId, '');
  t('DELETE_AUDIT_REASON', au1.entries[0].reason === 'UNSAFE', '');
  t('DELETE_AUDIT_TIMESTAMP', typeof au1.entries[0].timestamp === 'string', '');

  // 2. deleteAsset: SAFE 资产 → 拒绝(safety-decision)
  var a2 = makeSafeAsset();
  var r2 = mockRepo(a2), ts2 = mockTombstone(), au2 = mockAudit(), cl2 = mockCleaner(), ri2 = mockRefIndex([]);
  var svc2 = createAssetDeleteService(r2, ri2, ts2, au2, cl2, {});
  try { await svc2.deleteAsset(a2.assetId, 'UNSAFE'); t('DELETE_SAFE_REJECTED', false, ''); }
  catch (e) { t('DELETE_SAFE_REJECTED', /cannot delete/i.test(e.message), e.message); }
  t('DELETE_SAFE_NO_TOMBSTONE', ts2.records.length === 0, '');
  t('DELETE_SAFE_NO_MARK', r2.markTombstonedCalls.length === 0, '');
  t('DELETE_SAFE_NO_CLEAN', cl2.cleaned.length === 0, '');
  t('DELETE_SAFE_NO_AUDIT', au2.entries.length === 0, '');

  // 3. deleteAsset: 不存在 → 抛错
  var svc3 = createAssetDeleteService(mockRepo(makeUnsafeAsset()), mockRefIndex([]), mockTombstone(), mockAudit(), mockCleaner(), {});
  try { await svc3.deleteAsset('nonexistent', 'UNSAFE'); t('DELETE_NOT_FOUND_THROWS', false, ''); }
  catch (e) { t('DELETE_NOT_FOUND_THROWS', /not found/i.test(e.message), e.message); }

  // 4. deleteAsset: 有引用 → 拒绝
  var a4 = makeUnsafeAsset();
  var r4 = mockRepo(a4), ts4 = mockTombstone(), au4 = mockAudit(), cl4 = mockCleaner();
  var ri4 = mockRefIndex([{ type: 'active_snapshot', snapshotId: 'snap_1' }, { type: 'publication_history', snapshotId: 'snap_2' }]);
  var svc4 = createAssetDeleteService(r4, ri4, ts4, au4, cl4, {});
  try { await svc4.deleteAsset(a4.assetId, 'UNSAFE'); t('DELETE_HAS_REFS_REJECTED', false, ''); }
  catch (e) { t('DELETE_HAS_REFS_REJECTED', /active references/i.test(e.message), e.message); }
  t('DELETE_HAS_REFS_NO_TOMBSTONE', ts4.records.length === 0, '');
  t('DELETE_HAS_REFS_NO_MARK', r4.markTombstonedCalls.length === 0, '');
  t('DELETE_HAS_REFS_NO_CLEAN', cl4.cleaned.length === 0, '');
  t('DELETE_HAS_REFS_NO_AUDIT', au4.entries.length === 0, '');

  // 7. deleteAsset: 任一步失败 → fail-closed(不部分执行)
  //    tombstone.record 失败 → markTombstoned / cleaner / audit 全部不执行
  var a7 = makeUnsafeAsset();
  var r7 = mockRepo(a7), ts7 = mockTombstone(); ts7.recordFails = true;
  var au7 = mockAudit(), cl7 = mockCleaner(), ri7 = mockRefIndex([]);
  var svc7 = createAssetDeleteService(r7, ri7, ts7, au7, cl7, {});
  try { await svc7.deleteAsset(a7.assetId, 'UNSAFE'); t('DELETE_FAILCLOSED_THROWS', false, ''); }
  catch (e) { t('DELETE_FAILCLOSED_THROWS', /boom/i.test(e.message), e.message); }
  t('DELETE_FAILCLOSED_NO_MARK', r7.markTombstonedCalls.length === 0, '');
  t('DELETE_FAILCLOSED_NO_CLEAN', cl7.cleaned.length === 0, '');
  t('DELETE_FAILCLOSED_NO_AUDIT', au7.entries.length === 0, '');

  // 7b. markTombstoned 失败 → 后续 cleaner / audit 不执行
  var a8 = makeUnsafeAsset();
  var r8 = mockRepo(a8); r8.markTombstonedFails = true;
  var ts8 = mockTombstone(), au8 = mockAudit(), cl8 = mockCleaner(), ri8 = mockRefIndex([]);
  var svc8 = createAssetDeleteService(r8, ri8, ts8, au8, cl8, {});
  try { await svc8.deleteAsset(a8.assetId, 'UNSAFE'); t('DELETE_FAILCLOSED_MARK_THROWS', false, ''); }
  catch (e) { t('DELETE_FAILCLOSED_MARK_THROWS', /boom/i.test(e.message), e.message); }
  t('DELETE_FAILCLOSED_MARK_NO_CLEAN', cl8.cleaned.length === 0, '');
  t('DELETE_FAILCLOSED_MARK_NO_AUDIT', au8.entries.length === 0, '');

  // 8. SUSPICIOUS 资产 + reason SUSPICIOUS → 可删除
  var a9 = createAsset({ assetId: uid('ast_sus_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SUSPICIOUS', lifecycleStatus: 'DISCOVERED' });
  var r9 = mockRepo(a9), ts9 = mockTombstone(), au9 = mockAudit(), cl9 = mockCleaner(), ri9 = mockRefIndex([]);
  var svc9 = createAssetDeleteService(r9, ri9, ts9, au9, cl9, {});
  var res9 = await svc9.deleteAsset(a9.assetId, 'SUSPICIOUS');
  t('DELETE_SUSPICIOUS_OK', res9.status === 'DELETED', res9.status);
  t('DELETE_SUSPICIOUS_MARKED', r9.markTombstonedCalls.length === 1, '');

  // 9. 可选依赖为 null 时仍能正常删除(tombstoneStore/auditLog/cleaner 缺省)
  var a10 = makeUnsafeAsset();
  var r10 = mockRepo(a10);
  var svc10 = createAssetDeleteService(r10, null, null, null, null, {});
  var res10 = await svc10.deleteAsset(a10.assetId, 'UNSAFE');
  t('DELETE_NULL_DEPS_OK', res10.status === 'DELETED', res10.status);
  t('DELETE_NULL_DEPS_MARKED', r10.markTombstonedCalls.length === 1, '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + e.message + '\n' + e.stack); process.exit(1); });
