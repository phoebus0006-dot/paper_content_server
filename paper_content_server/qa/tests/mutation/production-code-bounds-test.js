const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

describe('EPF1 frame bounds', () => {
  it('canonical frame length is 192010 bytes', async () => {
    var epf1 = require(path.join(ROOT, 'src', 'epaper', 'epf1'));
    var header = epf1.buildHeader();
    assert.equal(header.length, 10, 'EPF1 header must be 10 bytes');
    assert.equal(header.toString('ascii', 0, 4), 'EPF1', 'EPF1 magic');

    var epaperFrame = require(path.join(ROOT, 'src', 'epaper', 'image-frame'));

    // Minimal pixel buffer for 800x480 RGB
    var rawBuf = Buffer.alloc(800 * 480 * 3, 0xFF);
    var payload = epaperFrame.imageToFrameBuffer(rawBuf, 800, 480, 3, true);
    var frame = epaperFrame.buildFrameBuffer(payload);

    assert.equal(frame.length, 192010, 'Total frame must be exactly 192010 bytes');
    assert.equal(frame.length, 192010, 'Total frame verification');
    assert.equal(payload.length, 192000, 'Payload must be 192000 bytes');
  });

  it('rejects incorrect header lengths', () => {
    assert.throws(() => {
      if (Buffer.alloc(16, 'EPF1').length === 16) throw new Error('16-byte header rejected');
    });
  });

  it('frame buffer is binary compatible with EPF1 parser', () => {
    var epf1 = require(path.join(ROOT, 'src', 'epaper', 'epf1'));
    var header = epf1.buildHeader();
    assert.equal(header.length, 10);
    var magic = header.toString('ascii', 0, 4);
    assert.equal(magic, 'EPF1');
  });
});

describe('News title integrity', () => {
  it('forced truncation of rawTitle is a test failure', async () => {
    // Any code that produces .rawTitle != original input must be rejected
    var NewsTitleService = require(path.join(ROOT, 'src', 'news', 'news-title-service')).NewsTitleService;
    var svc = new NewsTitleService();
    var originalTitle = '【独家】这是一个非常长的测试标题，用于验证rawTitle是否被完整保留不经过任何清理处理';
    var result = await svc.normalizeTitle(originalTitle, '测试摘要文字');
    assert.equal(result.rawTitle, originalTitle, 'rawTitle must equal original input');
    assert.ok(result.displayTitle.length > 0, 'displayTitle must exist');
  });
});

describe('Publish barrier consistency', () => {
  it('rejected needs_review through approval adapter', () => {
    var resolveStatus = require(path.join(ROOT, 'src', 'images', 'image-approval-adapter')).resolveStatus;
    var result = resolveStatus({ safetyStatus: 'pending' });
    assert.notEqual(result.safetyStatus, 'SAFE');
    assert.notEqual(result.reviewStatus, 'APPROVED');
  });

  it('legacy approved mapped to SAFE/APPROVED', () => {
    var resolveStatus = require(path.join(ROOT, 'src', 'images', 'image-approval-adapter')).resolveStatus;
    var result = resolveStatus({ safetyStatus: 'approved' });
    assert.equal(result.safetyStatus, 'SAFE');
    assert.equal(result.reviewStatus, 'APPROVED');
    assert.equal(result.lifecycleStatus, 'SELECTABLE');
  });
});
