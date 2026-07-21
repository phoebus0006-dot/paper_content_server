const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// --- Publish handler logic (mirrors server.js) ---

function checkNewsDraftItems(items) {
  const failed = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.titleStatus === 'needs_review' || item.reviewStatus === 'pending') {
      failed.push({ index: i, title: item.displayTitle || item.rawTitle, titleStatus: item.titleStatus, reviewStatus: item.reviewStatus });
    }
  }
  if (failed.length > 0) {
    return { ok: false, error: 'items need review: ' + JSON.stringify(failed) };
  }
  return { ok: true };
}

function checkPhotoPublish(entry) {
  if (!entry) return { ok: false, error: 'unknown photo' };
  if (entry.safetyStatus !== 'SAFE') {
    return { ok: false, error: 'photo safety check failed: ' + (entry.safetyStatus || 'unknown') };
  }
  if (entry.reviewStatus !== 'APPROVED') {
    return { ok: false, error: 'photo review check failed: ' + (entry.reviewStatus || 'unknown') };
  }
  return { ok: true };
}

describe('Publication workflows — publish handler (simulated server)', () => {
  describe('News publish — title/review validation', () => {
    it('should reject needs_review title status', () => {
      const draftItems = [
        { rawTitle: 'Test title', titleStatus: 'fit', reviewStatus: 'approved', displayTitle: 'Test title' },
        { rawTitle: 'Needs review title', titleStatus: 'needs_review', reviewStatus: 'pending', displayTitle: 'Needs review' }
      ];
      const result = checkNewsDraftItems(draftItems);
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('needs_review'));
    });

    it('should reject pending reviewStatus', () => {
      const draftItems = [
        { rawTitle: 'Good title', titleStatus: 'fit', reviewStatus: 'approved', displayTitle: 'Good title' },
        { rawTitle: 'Pending review', titleStatus: 'fit', reviewStatus: 'pending', displayTitle: 'Pending review' }
      ];
      const result = checkNewsDraftItems(draftItems);
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('pending'));
    });

    it('should accept all approved items', () => {
      const draftItems = [
        { rawTitle: 'Title 1', titleStatus: 'fit', reviewStatus: 'approved', displayTitle: 'Title 1' },
        { rawTitle: 'Title 2', titleStatus: 'fit', reviewStatus: 'approved', displayTitle: 'Title 2' }
      ];
      const result = checkNewsDraftItems(draftItems);
      assert.equal(result.ok, true);
    });

    it('should reject when first item has needs_review', () => {
      const draftItems = [
        { rawTitle: 'Bad', titleStatus: 'needs_review', reviewStatus: 'pending', displayTitle: 'Bad' },
        { rawTitle: 'Good', titleStatus: 'fit', reviewStatus: 'approved', displayTitle: 'Good' }
      ];
      const result = checkNewsDraftItems(draftItems);
      assert.equal(result.ok, false);
    });
  });

  describe('Photo publish — safety/review validation', () => {
    it('should accept SAFE/APPROVED photo', () => {
      const entry = { id: 'photo-1', safetyStatus: 'SAFE', reviewStatus: 'APPROVED' };
      const result = checkPhotoPublish(entry);
      assert.equal(result.ok, true);
    });

    it('should reject PENDING safetyStatus', () => {
      const entry = { id: 'photo-2', safetyStatus: 'PENDING', reviewStatus: 'APPROVED' };
      const result = checkPhotoPublish(entry);
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('safety'));
    });

    it('should reject UNSAFE safetyStatus', () => {
      const entry = { id: 'photo-3', safetyStatus: 'UNSAFE', reviewStatus: 'APPROVED' };
      const result = checkPhotoPublish(entry);
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('safety'));
    });

    it('should reject non-APPROVED reviewStatus', () => {
      const entry = { id: 'photo-4', safetyStatus: 'SAFE', reviewStatus: 'PENDING' };
      const result = checkPhotoPublish(entry);
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('review'));
    });

    it('should reject missing entry', () => {
      const result = checkPhotoPublish(null);
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('unknown'));
    });
  });
});

describe('Asset delete workflows', () => {
  let createAssetDeleteService, VALID_REASONS;

  before(() => {
    const mod = require('../../../src/assets/asset-delete-service');
    createAssetDeleteService = mod.createAssetDeleteService;
    VALID_REASONS = mod.VALID_REASONS;
  });

  function makeMockRepo(existingAssets) {
    const assets = new Map(Object.entries(existingAssets || {}));
    return {
      get: async (id) => assets.get(id) || null,
      markBlocked: async (id, reason) => {
        const a = assets.get(id);
        if (a) a.lifecycleStatus = 'BLOCKED';
      },
      markTombstoned: async (id, reason) => {
        const a = assets.get(id);
        if (a) a.lifecycleStatus = 'TOMBSTONED';
      }
    };
  }

  function makeNullService() {
    return {
      findReferences: async () => ({ references: [], complete: true }),
      write: async () => {},
      append: async () => {},
      cleanCache: async () => {}
    };
  }

  it('should successfully delete an asset via assetDeleteService', async () => {
    const repo = makeMockRepo({
      'photo-1': { assetId: 'photo-1', safetyStatus: 'UNSAFE', lifecycleStatus: 'SELECTABLE' }
    });
    const svc = createAssetDeleteService(
      repo,
      makeNullService(),
      makeNullService(),
      makeNullService(),
      makeNullService(),
      null,
      { enabled: true }
    );

    const result = await svc.deleteAsset('photo-1', 'UNSAFE');
    assert.equal(result.status, 'TOMBSTONED');
    assert.equal(result.assetId, 'photo-1');
    assert.equal(result.reason, 'UNSAFE');
  });

  it('should return 404-equivalent error when asset does not exist', async () => {
    const repo = makeMockRepo({});
    const svc = createAssetDeleteService(
      repo,
      makeNullService(),
      makeNullService(),
      makeNullService(),
      makeNullService(),
      null,
      { enabled: true }
    );

    try {
      await svc.deleteAsset('non-existent-id', 'UNSAFE');
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('not found'), 'Error should indicate asset not found, got: ' + e.message);
    }
  });

  it('should reject invalid delete reason', async () => {
    const repo = makeMockRepo({
      'photo-2': { assetId: 'photo-2', safetyStatus: 'UNSAFE', lifecycleStatus: 'SELECTABLE' }
    });
    const svc = createAssetDeleteService(
      repo,
      makeNullService(),
      makeNullService(),
      makeNullService(),
      makeNullService(),
      null,
      { enabled: true }
    );

    try {
      await svc.deleteAsset('photo-2', 'INVALID_REASON');
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('INVALID_REASON'));
    }
  });

  it('should reject delete when feature is disabled', async () => {
    const repo = makeMockRepo({
      'photo-3': { assetId: 'photo-3', safetyStatus: 'UNSAFE', lifecycleStatus: 'SELECTABLE' }
    });
    const svc = createAssetDeleteService(
      repo,
      makeNullService(),
      makeNullService(),
      makeNullService(),
      makeNullService(),
      null,
      { enabled: false }
    );

    try {
      await svc.deleteAsset('photo-3', 'UNSAFE');
      assert.fail('Should have thrown');
    } catch (e) {
      assert.equal(e.message, 'FEATURE_DISABLED');
    }
  });

  it('should enforce that VALID_REASONS enum is correct', () => {
    assert.deepEqual(VALID_REASONS, ['UNSAFE', 'SUSPICIOUS', 'POLICY_BLOCKED']);
  });
});
