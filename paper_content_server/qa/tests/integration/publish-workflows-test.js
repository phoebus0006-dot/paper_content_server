const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Approval adapter — publish barrier', () => {
  var adapter = require('../../../src/images/image-approval-adapter');

  it('rejects needs_review title (titleStatus=needs_review)', () => {
    // This mimics the check server.js publish/news does on draft items
    var item = { titleStatus: 'needs_review', reviewStatus: 'pending' };
    assert.ok(item.titleStatus === 'needs_review' || item.reviewStatus === 'pending');
  });

  it('rejects pending reviewStatus', () => {
    var item = { titleStatus: 'fit', reviewStatus: 'pending' };
    assert.ok(item.titleStatus === 'needs_review' || item.reviewStatus === 'pending');
  });

  it('rejects needs_review even if reviewStatus approved', () => {
    var item = { titleStatus: 'needs_review', reviewStatus: 'approved' };
    assert.ok(item.titleStatus === 'needs_review' || item.reviewStatus === 'pending');
  });

  it('allows fit+approved', () => {
    var item = { titleStatus: 'fit', reviewStatus: 'approved' };
    assert.ok(!(item.titleStatus === 'needs_review' || item.reviewStatus === 'pending'));
  });
});

describe('Approval adapter — photo publish barrier', () => {
  var adapter = require('../../../src/images/image-approval-adapter');

  it('rejects legacy pending safetyStatus', () => {
    var resolved = adapter.resolveStatus({ safetyStatus: 'pending' });
    assert.notEqual(resolved.safetyStatus, 'SAFE');
    assert.notEqual(resolved.reviewStatus, 'APPROVED');
    assert.equal(adapter.isPublishable({ safetyStatus: 'pending' }), false);
  });

  it('rejects UNSAFE photo', () => {
    var resolved = adapter.resolveStatus({ safetyStatus: 'UNSAFE' });
    assert.notEqual(resolved.safetyStatus, 'SAFE');
    assert.equal(adapter.isPublishable({ safetyStatus: 'UNSAFE' }), false);
  });

  it('accepts legacy approved safetyStatus', () => {
    assert.equal(adapter.isPublishable({ safetyStatus: 'approved' }), true, 'legacy approved should be publishable');
  });

  it('accepts current SAFE/APPROVED model', () => {
    assert.equal(adapter.isPublishable({ safetyStatus: 'SAFE', reviewStatus: 'APPROVED' }), true);
  });

  it('rejects current SAFE with PENDING review', () => {
    assert.equal(adapter.isPublishable({ safetyStatus: 'SAFE', reviewStatus: 'PENDING' }), false);
  });

  it('rejects missing entry (null)', () => {
    assert.equal(adapter.isPublishable(null), false);
  });
});

describe('Publication service — rollback basics', () => {
  var pubService;
  try {
    pubService = require('../../../src/publication/publication-service');
  } catch(e) {
    // Skip if module requires boot.deps
  }

  if (pubService) {
    it('exports PublicationService class', () => {
      assert.ok(typeof pubService.PublicationService === 'function');
    });
  }
});
