#!/usr/bin/env node
// AssetDeleteService — Atomic delete pipeline tests
// Covers: reason enum, markBlocked-before-tombstone, per-step failure (fail-closed),
//         retry/idempotency, lifecycle states, flag-off guard.
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { createAssetDeleteService, VALID_REASONS } = require(path.join(ROOT, 'src', 'assets', 'asset-delete-service'));
var { createAsset } = require(path.join(ROOT, 'src', 'assets', 'asset-model'));
var { canDelete } = require(path.join(ROOT, 'src', 'safety', 'safety-decision'));

function uid(p) { return p + Math.random().toString(36).slice(2, 8); }

// Asset factories — createAsset freezes objects, so mocks must return mutable copies.
function makeUnsafeAsset(lifecycle) {
  return createAsset({ assetId: uid('ast_del_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'UNSAFE', lifecycleStatus: lifecycle || 'DISCOVERED' });
}
function makeSuspiciousAsset() {
  return createAsset({ assetId: uid('ast_sus_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SUSPICIOUS', lifecycleStatus: 'DISCOVERED' });
}
function makeSafeSelectableAsset() {
  return createAsset({ assetId: uid('ast_safe_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' });
}

// Mock repository: tracks mutable lifecycle state across markBlocked/markTombstoned.
function mockRepo(asset) {
  var current = {
    assetId: asset.assetId,
    safetyStatus: asset.safetyStatus,
    lifecycleStatus: asset.lifecycleStatus,
    libraryType: asset.libraryType,
    sourceUrl: asset.sourceUrl,
  };
  return {
    _current: current,
    markBlockedCalls: [],
    markTombstonedCalls: [],
    markBlockedFails: false,
    markTombstonedFails: false,
    get: function (id) {
      if (id !== current.assetId) return Promise.resolve(null);
      // Return a fresh (non-frozen) copy reflecting current state.
      return Promise.resolve({
        assetId: current.assetId,
        safetyStatus: current.safetyStatus,
        lifecycleStatus: current.lifecycleStatus,
        libraryType: current.libraryType,
        sourceUrl: current.sourceUrl,
      });
    },
    markBlocked: function (id, reason) {
      this.markBlockedCalls.push({ id: id, reason: reason });
      if (this.markBlockedFails) return Promise.reject(new Error('markBlocked boom'));
      current.lifecycleStatus = 'BLOCKED';
      return Promise.resolve();
    },
    markTombstoned: function (id, reason) {
      this.markTombstonedCalls.push({ id: id, reason: reason });
      if (this.markTombstonedFails) return Promise.reject(new Error('markTombstoned boom'));
      current.lifecycleStatus = 'TOMBSTONED';
      return Promise.resolve();
    },
  };
}

// Mock reference index: returns { references, errors, complete } like the real one.
function mockRefIndex(refs) {
  return {
    refs: refs || [],
    findReferences: function (id) {
      return Promise.resolve({ assetId: id, references: this.refs, errors: [], complete: true });
    },
  };
}

// Mock tombstone store: keyed by assetId to mirror file-overwrite idempotency.
function mockTombstone() {
  return {
    records: {},
    writeFails: false,
    write: function (record) {
      if (this.writeFails) return Promise.reject(new Error('tombstone boom'));
      this.records[record.assetId] = record;
      return Promise.resolve();
    },
  };
}

function mockAudit() {
  return {
    entries: [],
    appendFails: false,
    append: function (e) {
      if (this.appendFails) return Promise.reject(new Error('audit boom'));
      this.entries.push(e);
      return Promise.resolve();
    },
  };
}

function mockCleaner() {
  return {
    cleaned: [],
    cleanFails: false,
    cleanCache: function (id) {
      if (this.cleanFails) return Promise.reject(new Error('cleaner boom'));
      this.cleaned.push(id);
      return Promise.resolve();
    },
  };
}

function svc(repo, ri, ts, au, cl, opts) {
  return createAssetDeleteService(repo, ri, ts, au, cl, { info: function () {} }, opts);
}

async function run() {
  // ---- sanity: canDelete & VALID_REASONS ----
  t('SANITY_VALID_REASONS', VALID_REASONS.join(',') === 'UNSAFE,SUSPICIOUS,POLICY_BLOCKED', VALID_REASONS.join(','));
  t('SANITY_CAN_DELETE_UNSAFE', canDelete(makeUnsafeAsset(), 'UNSAFE') === true, '');
  t('SANITY_CANNOT_DELETE_SAFE', canDelete(makeSafeSelectableAsset(), 'UNSAFE') === false, '');

  // ============================================================
  // 1. INVALID reason -> throw INVALID_REASON (before any IO)
  // ============================================================
  var a_inv = makeUnsafeAsset();
  var r_inv = mockRepo(a_inv), ts_inv = mockTombstone(), au_inv = mockAudit(), cl_inv = mockCleaner(), ri_inv = mockRefIndex([]);
  try {
    await svc(r_inv, ri_inv, ts_inv, au_inv, cl_inv).deleteAsset(a_inv.assetId, 'INVALID');
    t('INVALID_REASON_THROWS', false, 'did not throw');
  } catch (e) {
    t('INVALID_REASON_THROWS', /INVALID_REASON/.test(e.message), e.message);
  }
  t('INVALID_REASON_NO_MARK_BLOCKED', r_inv.markBlockedCalls.length === 0, '');
  t('INVALID_REASON_NO_TOMBSTONE', Object.keys(ts_inv.records).length === 0, '');
  t('INVALID_REASON_NO_TOMBSTONED', r_inv.markTombstonedCalls.length === 0, '');
  t('INVALID_REASON_NO_CLEAN', cl_inv.cleaned.length === 0, '');
  t('INVALID_REASON_NO_AUDIT', au_inv.entries.length === 0, '');

  // undefined / null reason also invalid
  try { await svc(mockRepo(makeUnsafeAsset()), mockRefIndex([]), mockTombstone(), mockAudit(), mockCleaner()).deleteAsset(uid('ast_'), undefined); t('UNDEFINED_REASON_THROWS', false, ''); }
  catch (e) { t('UNDEFINED_REASON_THROWS', /INVALID_REASON/.test(e.message), e.message); }
  try { await svc(mockRepo(makeUnsafeAsset()), mockRefIndex([]), mockTombstone(), mockAudit(), mockCleaner()).deleteAsset(uid('ast_'), null); t('NULL_REASON_THROWS', false, ''); }
  catch (e) { t('NULL_REASON_THROWS', /INVALID_REASON/.test(e.message), e.message); }

  // ============================================================
  // 2. LEGAL reasons (UNSAFE / SUSPICIOUS / POLICY_BLOCKED) -> success
  // ============================================================
  // UNSAFE
  var a1 = makeUnsafeAsset();
  var r1 = mockRepo(a1), ts1 = mockTombstone(), au1 = mockAudit(), cl1 = mockCleaner(), ri1 = mockRefIndex([]);
  var res1 = await svc(r1, ri1, ts1, au1, cl1).deleteAsset(a1.assetId, 'UNSAFE');
  t('UNSAFE_OK_STATUS', res1.status === 'TOMBSTONED', res1.status);
  t('UNSAFE_OK_ID', res1.assetId === a1.assetId, '');
  t('UNSAFE_OK_REASON', res1.reason === 'UNSAFE', '');
  t('UNSAFE_MARK_BLOCKED_FIRST', r1.markBlockedCalls.length === 1 && r1.markBlockedCalls[0].reason === 'UNSAFE', '');
  t('UNSAFE_MARK_TOMBSTONED_LAST', r1.markTombstonedCalls.length === 1, '');
  t('UNSAFE_BLOCK_BEFORE_TOMBSTONE_ORDER', r1.markBlockedCalls.length === 1 && Object.keys(ts1.records).length === 1, '');
  t('UNSAFE_TOMBSTONE_REASON', ts1.records[a1.assetId].reason === 'UNSAFE', '');
  t('UNSAFE_TOMBSTONE_DELETEDAT', typeof ts1.records[a1.assetId].deletedAt === 'string', '');
  t('UNSAFE_CLEANER_CALLED', cl1.cleaned.length === 1 && cl1.cleaned[0] === a1.assetId, '');
  t('UNSAFE_AUDIT_RECORDED', au1.entries.length === 1 && au1.entries[0].action === 'DELETE' && au1.entries[0].reason === 'UNSAFE', '');
  t('UNSAFE_FINAL_LIFECYCLE', r1._current.lifecycleStatus === 'TOMBSTONED', r1._current.lifecycleStatus);

  // SUSPICIOUS
  var a_sus = makeSuspiciousAsset();
  var r_sus = mockRepo(a_sus), ts_sus = mockTombstone(), au_sus = mockAudit(), cl_sus = mockCleaner(), ri_sus = mockRefIndex([]);
  var res_sus = await svc(r_sus, ri_sus, ts_sus, au_sus, cl_sus).deleteAsset(a_sus.assetId, 'SUSPICIOUS');
  t('SUSPICIOUS_OK', res_sus.status === 'TOMBSTONED', res_sus.status);
  t('SUSPICIOUS_MARK_BLOCKED', r_sus.markBlockedCalls.length === 1, '');
  t('SUSPICIOUS_MARK_TOMBSTONED', r_sus.markTombstonedCalls.length === 1, '');

  // POLICY_BLOCKED on UNSAFE asset
  var a_pb = makeUnsafeAsset();
  var r_pb = mockRepo(a_pb), ts_pb = mockTombstone(), au_pb = mockAudit(), cl_pb = mockCleaner(), ri_pb = mockRefIndex([]);
  var res_pb = await svc(r_pb, ri_pb, ts_pb, au_pb, cl_pb).deleteAsset(a_pb.assetId, 'POLICY_BLOCKED');
  t('POLICY_BLOCKED_OK', res_pb.status === 'TOMBSTONED', res_pb.status);
  t('POLICY_BLOCKED_MARK_BLOCKED_REASON', r_pb.markBlockedCalls[0].reason === 'POLICY_BLOCKED', '');

  // ============================================================
  // 3. SAFE asset -> throw (safety-decision gate)
  // ============================================================
  var a2 = makeSafeSelectableAsset();
  var r2 = mockRepo(a2), ts2 = mockTombstone(), au2 = mockAudit(), cl2 = mockCleaner(), ri2 = mockRefIndex([]);
  try { await svc(r2, ri2, ts2, au2, cl2).deleteAsset(a2.assetId, 'UNSAFE'); t('SAFE_REJECTED', false, ''); }
  catch (e) { t('SAFE_REJECTED', /cannot delete/i.test(e.message), e.message); }
  t('SAFE_NO_MARK_BLOCKED', r2.markBlockedCalls.length === 0, '');
  t('SAFE_NO_TOMBSTONE', Object.keys(ts2.records).length === 0, '');
  t('SAFE_NO_TOMBSTONED', r2.markTombstonedCalls.length === 0, '');
  t('SAFE_NO_CLEAN', cl2.cleaned.length === 0, '');
  t('SAFE_NO_AUDIT', au2.entries.length === 0, '');

  // ============================================================
  // 4. Lifecycle states: SELECTABLE / DISCOVERED / BLOCKED / TOMBSTONED
  // ============================================================
  // DISCOVERED + UNSAFE -> success (markBlocked: DISCOVERED -> BLOCKED, then BLOCKED -> TOMBSTONED)
  var a_disc = makeUnsafeAsset('DISCOVERED');
  var r_disc = mockRepo(a_disc), ts_disc = mockTombstone(), au_disc = mockAudit(), cl_disc = mockCleaner(), ri_disc = mockRefIndex([]);
  var res_disc = await svc(r_disc, ri_disc, ts_disc, au_disc, cl_disc).deleteAsset(a_disc.assetId, 'UNSAFE');
  t('LIFECYCLE_DISCOVERED_OK', res_disc.status === 'TOMBSTONED', res_disc.status);
  t('LIFECYCLE_DISCOVERED_MARKED_BLOCKED', r_disc.markBlockedCalls.length === 1, '');
  t('LIFECYCLE_DISCOVERED_NO_DIRECT_TOMBSTONE', r_disc.markBlockedCalls.length === 1 && r_disc.markTombstonedCalls.length === 1, '');

  // SELECTABLE must be SAFE -> canDelete false -> rejected
  var a_sel = makeSafeSelectableAsset();
  var r_sel = mockRepo(a_sel);
  try { await svc(r_sel, mockRefIndex([]), mockTombstone(), mockAudit(), mockCleaner()).deleteAsset(a_sel.assetId, 'UNSAFE'); t('LIFECYCLE_SELECTABLE_SAFE_REJECTED', false, ''); }
  catch (e) { t('LIFECYCLE_SELECTABLE_SAFE_REJECTED', /cannot delete/i.test(e.message), e.message); }
  t('LIFECYCLE_SELECTABLE_NO_MARK', r_sel.markBlockedCalls.length === 0, '');

  // BLOCKED + UNSAFE -> success; markBlocked SKIPPED (already BLOCKED) but markTombstoned runs
  var a_blk = makeUnsafeAsset('BLOCKED');
  var r_blk = mockRepo(a_blk), ts_blk = mockTombstone(), au_blk = mockAudit(), cl_blk = mockCleaner(), ri_blk = mockRefIndex([]);
  var res_blk = await svc(r_blk, ri_blk, ts_blk, au_blk, cl_blk).deleteAsset(a_blk.assetId, 'UNSAFE');
  t('LIFECYCLE_BLOCKED_OK', res_blk.status === 'TOMBSTONED', res_blk.status);
  t('LIFECYCLE_BLOCKED_SKIP_MARK_BLOCKED', r_blk.markBlockedCalls.length === 0, 'should skip markBlocked when already BLOCKED');
  t('LIFECYCLE_BLOCKED_MARK_TOMBSTONED', r_blk.markTombstonedCalls.length === 1, '');

  // TOMBSTONED -> canDelete false -> rejected
  var a_tomb = makeUnsafeAsset('TOMBSTONED');
  var r_tomb = mockRepo(a_tomb);
  try { await svc(r_tomb, mockRefIndex([]), mockTombstone(), mockAudit(), mockCleaner()).deleteAsset(a_tomb.assetId, 'UNSAFE'); t('LIFECYCLE_TOMBSTONED_REJECTED', false, ''); }
  catch (e) { t('LIFECYCLE_TOMBSTONED_REJECTED', /cannot delete/i.test(e.message), e.message); }
  t('LIFECYCLE_TOMBSTONED_NO_MARK', r_tomb.markTombstonedCalls.length === 0, '');

  // ============================================================
  // 5. Asset not found -> throw
  // ============================================================
  try { await svc(mockRepo(makeUnsafeAsset()), mockRefIndex([]), mockTombstone(), mockAudit(), mockCleaner()).deleteAsset('nonexistent', 'UNSAFE'); t('NOT_FOUND_THROWS', false, ''); }
  catch (e) { t('NOT_FOUND_THROWS', /not found/i.test(e.message), e.message); }

  // ============================================================
  // 6. Reference exists -> throw (no side effects)
  // ============================================================
  var a4 = makeUnsafeAsset();
  var r4 = mockRepo(a4), ts4 = mockTombstone(), au4 = mockAudit(), cl4 = mockCleaner();
  var ri4 = mockRefIndex([{ type: 'active_snapshot', snapshotId: 'snap_1' }, { type: 'publication_history', snapshotId: 'snap_2' }]);
  try { await svc(r4, ri4, ts4, au4, cl4).deleteAsset(a4.assetId, 'UNSAFE'); t('HAS_REFS_REJECTED', false, ''); }
  catch (e) { t('HAS_REFS_REJECTED', /active references/i.test(e.message), e.message); }
  t('HAS_REFS_NO_MARK_BLOCKED', r4.markBlockedCalls.length === 0, '');
  t('HAS_REFS_NO_TOMBSTONE', Object.keys(ts4.records).length === 0, '');
  t('HAS_REFS_NO_TOMBSTONED', r4.markTombstonedCalls.length === 0, '');
  t('HAS_REFS_NO_CLEAN', cl4.cleaned.length === 0, '');
  t('HAS_REFS_NO_AUDIT', au4.entries.length === 0, '');

  // ============================================================
  // 7. markBlocked failure -> throw MARK_BLOCKED_FAILED (asset unchanged, no later steps)
  // ============================================================
  var a7 = makeUnsafeAsset();
  var r7 = mockRepo(a7); r7.markBlockedFails = true;
  var ts7 = mockTombstone(), au7 = mockAudit(), cl7 = mockCleaner(), ri7 = mockRefIndex([]);
  try { await svc(r7, ri7, ts7, au7, cl7).deleteAsset(a7.assetId, 'UNSAFE'); t('MARK_BLOCKED_FAIL_THROWS', false, ''); }
  catch (e) { t('MARK_BLOCKED_FAIL_THROWS', /MARK_BLOCKED_FAILED/.test(e.message), e.message); }
  t('MARK_BLOCKED_FAIL_NO_TOMBSTONE', Object.keys(ts7.records).length === 0, '');
  t('MARK_BLOCKED_FAIL_NO_CLEAN', cl7.cleaned.length === 0, '');
  t('MARK_BLOCKED_FAIL_NO_AUDIT', au7.entries.length === 0, '');
  t('MARK_BLOCKED_FAIL_NO_TOMBSTONED', r7.markTombstonedCalls.length === 0, '');
  t('MARK_BLOCKED_FAIL_ASSET_UNCHANGED', r7._current.lifecycleStatus === 'DISCOVERED', r7._current.lifecycleStatus);

  // ============================================================
  // 8. tombstone write failure -> throw TOMBSTONE_WRITE_FAILED (asset BLOCKED, retryable)
  // ============================================================
  var a8 = makeUnsafeAsset();
  var r8 = mockRepo(a8), ts8 = mockTombstone(); ts8.writeFails = true;
  var au8 = mockAudit(), cl8 = mockCleaner(), ri8 = mockRefIndex([]);
  try { await svc(r8, ri8, ts8, au8, cl8).deleteAsset(a8.assetId, 'UNSAFE'); t('TOMBSTONE_FAIL_THROWS', false, ''); }
  catch (e) { t('TOMBSTONE_FAIL_THROWS', /TOMBSTONE_WRITE_FAILED/.test(e.message), e.message); }
  t('TOMBSTONE_FAIL_ASSET_BLOCKED', r8._current.lifecycleStatus === 'BLOCKED', r8._current.lifecycleStatus);
  t('TOMBSTONE_FAIL_NO_CLEAN', cl8.cleaned.length === 0, '');
  t('TOMBSTONE_FAIL_NO_AUDIT', au8.entries.length === 0, '');
  t('TOMBSTONE_FAIL_NO_TOMBSTONED', r8.markTombstonedCalls.length === 0, '');

  // ============================================================
  // 9. cleanup failure -> throw CLEANUP_FAILED (asset BLOCKED + tombstone written, retryable)
  // ============================================================
  var a9 = makeUnsafeAsset();
  var r9 = mockRepo(a9), ts9 = mockTombstone(), au9 = mockAudit(), cl9 = mockCleaner(); cl9.cleanFails = true;
  var ri9 = mockRefIndex([]);
  try { await svc(r9, ri9, ts9, au9, cl9).deleteAsset(a9.assetId, 'UNSAFE'); t('CLEANUP_FAIL_THROWS', false, ''); }
  catch (e) { t('CLEANUP_FAIL_THROWS', /CLEANUP_FAILED/.test(e.message), e.message); }
  t('CLEANUP_FAIL_ASSET_BLOCKED', r9._current.lifecycleStatus === 'BLOCKED', r9._current.lifecycleStatus);
  t('CLEANUP_FAIL_TOMBSTONE_WRITTEN', Object.keys(ts9.records).length === 1, '');
  t('CLEANUP_FAIL_NO_AUDIT', au9.entries.length === 0, '');
  t('CLEANUP_FAIL_NO_TOMBSTONED', r9.markTombstonedCalls.length === 0, '');

  // ============================================================
  // 10. audit failure -> throw AUDIT_FAILED (asset BLOCKED + tombstone + cleaned, retryable)
  // ============================================================
  var a10 = makeUnsafeAsset();
  var r10 = mockRepo(a10), ts10 = mockTombstone(), au10 = mockAudit(); au10.appendFails = true;
  var cl10 = mockCleaner(), ri10 = mockRefIndex([]);
  try { await svc(r10, ri10, ts10, au10, cl10).deleteAsset(a10.assetId, 'UNSAFE'); t('AUDIT_FAIL_THROWS', false, ''); }
  catch (e) { t('AUDIT_FAIL_THROWS', /AUDIT_FAILED/.test(e.message), e.message); }
  t('AUDIT_FAIL_ASSET_BLOCKED', r10._current.lifecycleStatus === 'BLOCKED', r10._current.lifecycleStatus);
  t('AUDIT_FAIL_TOMBSTONE_WRITTEN', Object.keys(ts10.records).length === 1, '');
  t('AUDIT_FAIL_CLEANED', cl10.cleaned.length === 1, '');
  t('AUDIT_FAIL_NO_TOMBSTONED', r10.markTombstonedCalls.length === 0, '');

  // ============================================================
  // 11. markTombstoned failure -> throw MARK_TOMBSTONED_FAILED (asset still BLOCKED, retryable)
  // ============================================================
  var a11 = makeUnsafeAsset();
  var r11 = mockRepo(a11); r11.markTombstonedFails = true;
  var ts11 = mockTombstone(), au11 = mockAudit(), cl11 = mockCleaner(), ri11 = mockRefIndex([]);
  try { await svc(r11, ri11, ts11, au11, cl11).deleteAsset(a11.assetId, 'UNSAFE'); t('MARK_TOMBSTONED_FAIL_THROWS', false, ''); }
  catch (e) { t('MARK_TOMBSTONED_FAIL_THROWS', /MARK_TOMBSTONED_FAILED/.test(e.message), e.message); }
  t('MARK_TOMBSTONED_FAIL_ASSET_BLOCKED', r11._current.lifecycleStatus === 'BLOCKED', r11._current.lifecycleStatus);
  t('MARK_TOMBSTONED_FAIL_TOMBSTONE_WRITTEN', Object.keys(ts11.records).length === 1, '');
  t('MARK_TOMBSTONED_FAIL_CLEANED', cl11.cleaned.length === 1, '');
  t('MARK_TOMBSTONED_FAIL_AUDITED', au11.entries.length === 1, '');

  // ============================================================
  // 12. Retry / idempotency: tombstone-fail then succeed -> no duplicate tombstone, markBlocked not re-called
  // ============================================================
  var a12 = makeUnsafeAsset();
  var r12 = mockRepo(a12), ts12 = mockTombstone(), au12 = mockAudit(), cl12 = mockCleaner(), ri12 = mockRefIndex([]);
  // Attempt 1: tombstone fails
  ts12.writeFails = true;
  try { await svc(r12, ri12, ts12, au12, cl12).deleteAsset(a12.assetId, 'UNSAFE'); t('RETRY_ATTEMPT1_THROWS', false, ''); }
  catch (e) { t('RETRY_ATTEMPT1_THROWS', /TOMBSTONE_WRITE_FAILED/.test(e.message), e.message); }
  t('RETRY_ATTEMPT1_BLOCKED', r12._current.lifecycleStatus === 'BLOCKED', r12._current.lifecycleStatus);
  t('RETRY_ATTEMPT1_MARK_BLOCKED_ONCE', r12.markBlockedCalls.length === 1, '');
  t('RETRY_ATTEMPT1_NO_TOMBSTONE', Object.keys(ts12.records).length === 0, '');
  t('RETRY_ATTEMPT1_NO_AUDIT', au12.entries.length === 0, '');
  // Attempt 2: tombstone succeeds -> retry should skip markBlocked, not duplicate tombstone
  ts12.writeFails = false;
  var res12 = await svc(r12, ri12, ts12, au12, cl12).deleteAsset(a12.assetId, 'UNSAFE');
  t('RETRY_ATTEMPT2_OK', res12.status === 'TOMBSTONED', res12.status);
  t('RETRY_MARK_BLOCKED_NOT_RECALLED', r12.markBlockedCalls.length === 1, 'should be idempotent: still 1');
  t('RETRY_TOMBSTONE_NOT_DUPLICATED', Object.keys(ts12.records).length === 1, 'overwrite, not duplicate');
  t('RETRY_TOMBSTONE_REASON', ts12.records[a12.assetId].reason === 'UNSAFE', '');
  t('RETRY_AUDIT_APPENDED', au12.entries.length === 1, '');
  t('RETRY_MARK_TOMBSTONED_ONCE', r12.markTombstonedCalls.length === 1, '');
  t('RETRY_FINAL_LIFECYCLE', r12._current.lifecycleStatus === 'TOMBSTONED', r12._current.lifecycleStatus);

  // ============================================================
  // 12b. Retry after cleanup failure -> cleanup retried, audit/markTombstoned complete
  // ============================================================
  var a12b = makeUnsafeAsset();
  var r12b = mockRepo(a12b), ts12b = mockTombstone(), au12b = mockAudit(), cl12b = mockCleaner(); cl12b.cleanFails = true;
  var ri12b = mockRefIndex([]);
  try { await svc(r12b, ri12b, ts12b, au12b, cl12b).deleteAsset(a12b.assetId, 'UNSAFE'); t('RETRY_CLEAN_ATTEMPT1_THROWS', false, ''); }
  catch (e) { t('RETRY_CLEAN_ATTEMPT1_THROWS', /CLEANUP_FAILED/.test(e.message), e.message); }
  cl12b.cleanFails = false;
  var res12b = await svc(r12b, ri12b, ts12b, au12b, cl12b).deleteAsset(a12b.assetId, 'UNSAFE');
  t('RETRY_CLEAN_ATTEMPT2_OK', res12b.status === 'TOMBSTONED', res12b.status);
  t('RETRY_CLEAN_TOMBSTONE_NOT_DUPLICATED', Object.keys(ts12b.records).length === 1, '');
  t('RETRY_CLEAN_MARK_BLOCKED_ONCE', r12b.markBlockedCalls.length === 1, '');
  t('RETRY_CLEAN_FINAL_TOMBSTONED', r12b._current.lifecycleStatus === 'TOMBSTONED', '');

  // ============================================================
  // 13. flag off -> throw FEATURE_DISABLED (no side effects)
  // ============================================================
  var a13 = makeUnsafeAsset();
  var r13 = mockRepo(a13), ts13 = mockTombstone(), au13 = mockAudit(), cl13 = mockCleaner(), ri13 = mockRefIndex([]);
  try { await svc(r13, ri13, ts13, au13, cl13, { enabled: false }).deleteAsset(a13.assetId, 'UNSAFE'); t('FLAG_OFF_THROWS', false, ''); }
  catch (e) { t('FLAG_OFF_THROWS', /FEATURE_DISABLED/.test(e.message), e.message); }
  t('FLAG_OFF_NO_MARK_BLOCKED', r13.markBlockedCalls.length === 0, '');
  t('FLAG_OFF_NO_TOMBSTONE', Object.keys(ts13.records).length === 0, '');
  t('FLAG_OFF_NO_TOMBSTONED', r13.markTombstonedCalls.length === 0, '');
  t('FLAG_OFF_NO_CLEAN', cl13.cleaned.length === 0, '');
  t('FLAG_OFF_NO_AUDIT', au13.entries.length === 0, '');
  // flag off takes precedence over reason validation? Reason is validated AFTER flag check.
  // Verify flag-off short-circuits even with a legal reason:
  t('FLAG_OFF_PRECEDENCE', r13.markBlockedCalls.length === 0 && Object.keys(ts13.records).length === 0, '');

  // ============================================================
  // 14. Optional deps null (tombstoneStore/auditLog/cleaner/refIndex omitted) -> still works
  // ============================================================
  var a14 = makeUnsafeAsset();
  var r14 = mockRepo(a14);
  var svc14 = createAssetDeleteService(r14, null, null, null, null, {});
  var res14 = await svc14.deleteAsset(a14.assetId, 'UNSAFE');
  t('NULL_DEPS_OK', res14.status === 'TOMBSTONED', res14.status);
  t('NULL_DEPS_MARK_BLOCKED', r14.markBlockedCalls.length === 1, '');
  t('NULL_DEPS_MARK_TOMBSTONED', r14.markTombstonedCalls.length === 1, '');

  // ============================================================
  // 15. Atomicity: step order is markBlocked -> tombstone -> cleanup -> audit -> markTombstoned
  //     (verify via call recording on a clean run)
  // ============================================================
  var a15 = makeUnsafeAsset();
  var r15 = mockRepo(a15);
  var order = [];
  var ts15 = { write: function (rec) { order.push('tombstone'); return Promise.resolve(); } };
  var au15 = { append: function (e) { order.push('audit'); return Promise.resolve(); } };
  var cl15 = { cleanCache: function (id) { order.push('cleanup'); return Promise.resolve(); } };
  var r15wrap = {
    get: function (id) { return r15.get(id); },
    markBlocked: function (id, reason) { order.push('markBlocked'); return r15.markBlocked(id, reason); },
    markTombstoned: function (id, reason) { order.push('markTombstoned'); return r15.markTombstoned(id, reason); },
  };
  await createAssetDeleteService(r15wrap, mockRefIndex([]), ts15, au15, cl15, {}).deleteAsset(a15.assetId, 'UNSAFE');
  t('ATOMICITY_ORDER', order.join(',') === 'markBlocked,tombstone,cleanup,audit,markTombstoned', order.join(','));

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + e.message + '\n' + e.stack); process.exit(1); });
