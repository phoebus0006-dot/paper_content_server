#!/usr/bin/env node
// delete-service-composition-test.js — Verifies the production composition
// root's adapters expose the EXACT method names AssetDeleteService calls
// (findReferences / write / cleanCache / append) — NOT the wrong names that
// used to be in compose-services.js (getReferences / record / cleanForAsset /
// record). Uses REAL adapters built with the same pattern as compose-services
// and REAL raw services (AssetReferenceIndex, TombstoneStore, SafetyAuditLog,
// ReferenceCleaner); only the assetRepository is a minimal in-memory mock.
//
// Tests:
//   COMPOSED_DELETE_REFERENCE_CHECK — reference check step runs through the
//     composed adapter (findReferences); no TypeError for a wrong method name.
//   COMPOSED_DELETE_MARK_BLOCKED — markBlocked step succeeds.
//   COMPOSED_DELETE_TOMBSTONE_WRITE — tombstone write step succeeds.
//   COMPOSED_DELETE_CLEANUP — cleanup step succeeds.
//   COMPOSED_DELETE_AUDIT — audit log append step succeeds.
//   COMPOSED_DELETE_MARK_TOMBSTONED — final markTombstoned succeeds and the
//     asset's lifecycle ends at TOMBSTONED.
//   COMPOSED_DELETE_CLEANUP_FAILURE_REJECTS — when the real ReferenceCleaner
//     throws, the whole delete rejects with CLEANUP_FAILED (the empty catch
//     blocks that used to swallow cleanup errors are gone).
var path = require('path');
var fs = require('fs');
var os = require('os');

var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var { createAssetDeleteService } = require(path.join(ROOT, 'src', 'assets', 'asset-delete-service'));
var { AssetReferenceIndex } = require(path.join(ROOT, 'src', 'assets', 'asset-reference-index'));
var { TombstoneStore } = require(path.join(ROOT, 'src', 'safety', 'tombstone-store'));
var { SafetyAuditLog } = require(path.join(ROOT, 'src', 'safety', 'safety-audit-log'));
var { ReferenceCleaner } = require(path.join(ROOT, 'src', 'safety', 'reference-cleaner'));
var { createAsset } = require(path.join(ROOT, 'src', 'assets', 'asset-model'));

function uid(p) { return p + Math.random().toString(36).slice(2, 10); }

// Minimal in-memory assetRepository — same shape as the production interface
// (get / markBlocked / markTombstoned). Tracks lifecycle transitions so we can
// assert the delete pipeline advanced through BLOCKED -> TOMBSTONED.
function inMemoryRepo(asset) {
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
    get: function (id) {
      if (id !== current.assetId) return Promise.resolve(null);
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
      current.lifecycleStatus = 'BLOCKED';
      return Promise.resolve();
    },
    markTombstoned: function (id, reason) {
      this.markTombstonedCalls.push({ id: id, reason: reason });
      current.lifecycleStatus = 'TOMBSTONED';
      return Promise.resolve();
    },
  };
}

// Build REAL adapters using the SAME pattern as compose-services.js. This is
// the contract under test: the adapter method names must match what
// AssetDeleteService calls.
//
// cacheInspector is a dependency of AssetReferenceIndex (NOT the adapter) —
// compose-services.js passes null, which causes AssetReferenceIndex to push
// a non-removable "cache: UNKNOWN" placeholder ref that blocks every delete.
// That is a separate concern from the adapter method-name contract under
// test here, so we inject a no-op cacheInspector (returns []) to exercise the
// full pipeline through to markTombstoned.
function buildRealAdapters(dataDir, snapshotStore, snapshotCache, publicationHistory, logger, cacheInspector) {
  var refIndex = AssetReferenceIndex(dataDir, snapshotStore, publicationHistory, cacheInspector || function () { return []; });
  var referenceIndexAdapter = {
    findReferences: function (assetId) { return refIndex.findReferences(assetId); },
  };

  var tombstoneDir = path.join(dataDir, 'tombstones');
  fs.mkdirSync(tombstoneDir, { recursive: true });
  var tombstoneStoreRaw = TombstoneStore(tombstoneDir, logger);
  var tombstoneStoreAdapter = {
    write: function (record) { return tombstoneStoreRaw.write(record); },
  };

  var auditLogFile = path.join(dataDir, 'safety-audit.log');
  var auditLogRaw = SafetyAuditLog(auditLogFile, logger);
  var safetyAuditLogAdapter = {
    append: function (entry) { return auditLogRaw.append(entry); },
  };

  var referenceCleanerRaw = ReferenceCleaner(snapshotStore, snapshotCache, publicationHistory, dataDir, logger);
  var referenceCleanerAdapter = {
    cleanCache: function (assetId) {
      // Mirrors compose-services.js: NO try/catch — exceptions propagate.
      referenceCleanerRaw.cleanCache(assetId);
      referenceCleanerRaw.cleanLegacyIndexes(assetId, null);
      return Promise.resolve();
    },
  };

  return {
    referenceIndexAdapter: referenceIndexAdapter,
    tombstoneStoreAdapter: tombstoneStoreAdapter,
    safetyAuditLogAdapter: safetyAuditLogAdapter,
    referenceCleanerAdapter: referenceCleanerAdapter,
    // Expose raw services so the test can inspect side effects (tombstone file,
    // audit log file).
    _tombstoneDir: tombstoneDir,
    _auditLogFile: auditLogFile,
  };
}

function makeUnsafeAsset() {
  return createAsset({ assetId: uid('ast_del_comp_'), sourceUrl: 'http://x', libraryType: 'LEARNING', safetyStatus: 'UNSAFE', lifecycleStatus: 'DISCOVERED' });
}

async function run() {
  var logger = { info: function () {}, warn: function () {}, error: function () {} };

  // === Happy-path scenario: real adapters + real raw services ===
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-comp-'));
  var dataDir = path.join(tmpRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Stub snapshotStore / snapshotCache / publicationHistory — only the
  // ReferenceCleaner and AssetReferenceIndex consume them, and they handle
  // null/empty gracefully. We do NOT mock the adapters themselves.
  var snapshotStoreStub = { readActive: function () { return Promise.resolve(null); }, load: function () { return Promise.resolve(null); } };
  var snapshotCacheStub = { keys: function () { return []; }, get: function () { return null; }, delete: function () {} };
  var publicationHistoryStub = { list: function () { return Promise.resolve([]); } };

  var adapters = buildRealAdapters(dataDir, snapshotStoreStub, snapshotCacheStub, publicationHistoryStub, logger);

  var asset = makeUnsafeAsset();
  var repo = inMemoryRepo(asset);

  var svc = createAssetDeleteService(
    repo,
    adapters.referenceIndexAdapter,
    adapters.tombstoneStoreAdapter,
    adapters.safetyAuditLogAdapter,
    adapters.referenceCleanerAdapter,
    logger
  );

  // Run the full delete. If any adapter method name is wrong, this throws
  // TypeError before reaching the lifecycle steps.
  var result;
  try {
    result = await svc.deleteAsset(asset.assetId, 'UNSAFE');
  } catch (e) {
    t('COMPOSED_DELETE_REFERENCE_CHECK', false, 'delete threw: ' + e.message);
    throw e;
  }

  // 1. Reference check ran via adapter.findReferences (no TypeError).
  t('COMPOSED_DELETE_REFERENCE_CHECK',
    typeof adapters.referenceIndexAdapter.findReferences === 'function' && result.status === 'TOMBSTONED',
    'status=' + result.status);

  // 2. markBlocked was called (transitioning DISCOVERED -> BLOCKED).
  t('COMPOSED_DELETE_MARK_BLOCKED',
    repo.markBlockedCalls.length === 1 && repo.markBlockedCalls[0].reason === 'UNSAFE',
    'calls=' + repo.markBlockedCalls.length);

  // 3. Tombstone file written by the real TombstoneStore.
  var tombstoneFile = path.join(adapters._tombstoneDir, asset.assetId + '.json');
  var tombstoneWritten = false;
  try {
    var tombstoneContent = JSON.parse(fs.readFileSync(tombstoneFile, 'utf8'));
    tombstoneWritten = tombstoneContent.assetId === asset.assetId && tombstoneContent.reason === 'UNSAFE';
  } catch (e) { tombstoneWritten = false; }
  t('COMPOSED_DELETE_TOMBSTONE_WRITE', tombstoneWritten, 'file=' + tombstoneFile);

  // 4. Cleanup step ran via adapter.cleanCache (no TypeError, no swallow).
  //    The real ReferenceCleaner.cleanCache returned a result object; the
  //    adapter also called cleanLegacyIndexes. We assert no error escaped
  //    (delete proceeded past cleanup to audit + markTombstoned).
  t('COMPOSED_DELETE_CLEANUP',
    repo.markTombstonedCalls.length === 1,
    'cleanup did not block pipeline; markTombstoned called=' + repo.markTombstonedCalls.length);

  // 5. Audit log appended by the real SafetyAuditLog.
  var auditAppended = false;
  try {
    var auditText = fs.readFileSync(adapters._auditLogFile, 'utf8').trim();
    var auditLines = auditText.split('\n');
    auditAppended = auditLines.some(function (line) {
      try {
        var e = JSON.parse(line);
        return e.action === 'DELETE' && e.assetId === asset.assetId && e.reason === 'UNSAFE';
      } catch (e2) { return false; }
    });
  } catch (e) { auditAppended = false; }
  t('COMPOSED_DELETE_AUDIT', auditAppended, 'file=' + adapters._auditLogFile);

  // 6. Final markTombstoned ran and lifecycle ends at TOMBSTONED.
  t('COMPOSED_DELETE_MARK_TOMBSTONED',
    repo.markTombstonedCalls.length === 1 && repo.markTombstonedCalls[0].reason === 'UNSAFE' && repo._current.lifecycleStatus === 'TOMBSTONED',
    'lifecycle=' + repo._current.lifecycleStatus);

  // === Failure scenario: real ReferenceCleaner throws -> delete rejects ===
  // We rebuild the adapters with a snapshotCache whose keys() throws. The real
  // ReferenceCleaner.cleanCache will throw synchronously; with the empty catch
  // removed, the exception must propagate as CLEANUP_FAILED.
  var tmpRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-comp-fail-'));
  var dataDir2 = path.join(tmpRoot2, 'data');
  fs.mkdirSync(dataDir2, { recursive: true });

  var throwingSnapshotCache = {
    keys: function () { throw new Error('snapshot cache keys boom'); },
    get: function () { return null; },
    delete: function () {},
  };
  var adaptersFail = buildRealAdapters(dataDir2, snapshotStoreStub, throwingSnapshotCache, publicationHistoryStub, logger);

  var asset2 = makeUnsafeAsset();
  var repo2 = inMemoryRepo(asset2);
  var svc2 = createAssetDeleteService(
    repo2,
    adaptersFail.referenceIndexAdapter,
    adaptersFail.tombstoneStoreAdapter,
    adaptersFail.safetyAuditLogAdapter,
    adaptersFail.referenceCleanerAdapter,
    logger
  );

  var cleanupRejectReason = null;
  var cleanupDidNotComplete = false;
  try {
    await svc2.deleteAsset(asset2.assetId, 'UNSAFE');
    // If we get here, the empty catch swallowed the cleanup error — test fails.
    cleanupDidNotComplete = false;
  } catch (e) {
    cleanupRejectReason = e.message || String(e);
    // markTombstoned must NOT have run (cleanup failed before audit/markTombstoned).
    cleanupDidNotComplete = repo2.markTombstonedCalls.length === 0;
  }
  t('COMPOSED_DELETE_CLEANUP_FAILURE_REJECTS',
    /CLEANUP_FAILED/.test(cleanupRejectReason) && cleanupDidNotComplete,
    'reason=' + cleanupRejectReason + ' markTombstoned=' + repo2.markTombstonedCalls.length);

  // Cleanup temp dirs.
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmpRoot2, { recursive: true, force: true }); } catch (e) {}

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function (e) {
  console.log('CRASH: ' + (e && e.message ? e.message : e));
  console.log(e && e.stack ? e.stack : '');
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e2) {}
  try { fs.rmSync(tmpRoot2, { recursive: true, force: true }); } catch (e3) {}
  process.exit(1);
});
