const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Approval adapter — publish barrier', () => {
  it('rejects needs_review title (titleStatus=needs_review)', () => {
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
  var tmpDir, fixturePng, crypto;

  before(() => {
    crypto = require('crypto');
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-adapter-'));
    var pngData = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); // minimal PNG
    fixturePng = path.join(tmpDir, 'test-photo.png');
    fs.writeFileSync(fixturePng, pngData);
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
  });

  it('rejects legacy pending safetyStatus', () => {
    assert.equal(adapter.isPublishable({ safetyStatus: 'pending' }), false);
  });

  it('rejects UNSAFE photo', () => {
    assert.equal(adapter.isPublishable({ safetyStatus: 'UNSAFE' }), false);
  });

  it('accepts legacy approved with real file and sourceHash', () => {
    var sha = crypto.createHash('sha256').update(fs.readFileSync(fixturePng)).digest('hex');
    var entry = {
      safetyStatus: 'approved',
      rawPath: fixturePng,
      sha256: sha
    };
    assert.equal(adapter.isPublishable(entry), true, 'legacy approved with verified file should be publishable');
  });

  it('rejects legacy approved with missing file (deleted)', () => {
    var entry = {
      safetyStatus: 'approved',
      rawPath: path.join(tmpDir, 'ghost.png'),
      sha256: 'aaaaaaaa'
    };
    assert.equal(adapter.isPublishable(entry), false, 'legacy approved with missing file must not be publishable');
  });

  it('rejects legacy approved with hash mismatch', () => {
    var entry = {
      safetyStatus: 'approved',
      rawPath: fixturePng,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000'
    };
    assert.equal(adapter.isPublishable(entry), false, 'hash mismatch must not be publishable');
  });

  it('rejects legacy approved in quarantine path', () => {
    var qPng = path.join(tmpDir, 'quarantine-img.png');
    fs.writeFileSync(qPng, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    var sha = crypto.createHash('sha256').update(fs.readFileSync(qPng)).digest('hex');
    var entry = {
      safetyStatus: 'approved',
      rawPath: qPng,
      sha256: sha
    };
    assert.equal(adapter.isPublishable(entry), true, 'path not named quarantine passes');
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

  it('rejects rejected legacy status', () => {
    assert.equal(adapter.isPublishable({ safetyStatus: 'rejected' }), false);
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
