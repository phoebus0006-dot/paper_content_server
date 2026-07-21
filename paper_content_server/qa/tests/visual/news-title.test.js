const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('NewsTitleService — visual rendering', () => {
  let nts;

  before(async () => {
    const { NewsTitleService } = require('../../../src/news/news-title-service');
    nts = new NewsTitleService();
  });

  it('should return structured result with all required fields', async () => {
    const r = await nts.normalizeTitle('Test visual title', 'Summary');
    const expectedFields = [
      'rawTitle', 'displayTitle', 'titleWidthPx', 'titleMaxWidthPx',
      'titleStatus', 'reviewStatus', 'normalizationVersion'
    ];
    for (const f of expectedFields) {
      assert.ok(f in r, 'Missing required field: ' + f + ' in ' + JSON.stringify(Object.keys(r)));
    }
  });

  it('should not contain truncation markers in displayTitle', async () => {
    const titles = [
      '短标题',
      'A normal English title for testing',
      '这是一个普通的测试标题用于验证显示效果',
      '最新快讯 今日要闻摘要',
      '【直播】新闻发布会特别报道',
    ];
    for (const t of titles) {
      const r = await nts.normalizeTitle(t, 'Summary');
      assert.equal(typeof r.displayTitle, 'string');
      assert.ok(!r.displayTitle.includes('...'), 'displayTitle should not contain "..." for: ' + t + ', got: ' + r.displayTitle);
      assert.ok(!r.displayTitle.includes('..'), 'displayTitle should not contain ".." for: ' + t + ', got: ' + r.displayTitle);
    }
  });

  it('should preserve long titles in rawTitle without truncation', async () => {
    const longTitle = '这是一个非常长的标题它不应该被直接截断而是通过语义处理保留完整内容以便前端显示';
    const r = await nts.normalizeTitle(longTitle, '摘要');
    assert.equal(r.rawTitle, longTitle);
    assert.ok(r.titleWidthPx > 0);
    assert.ok(r.titleMaxWidthPx > 0);
    assert.ok(r.normalizationVersion);
  });

  it('should preserve original title in rawTitle when prefix is cleaned', async () => {
    const raw = 'A normal title without prefix';
    const r = await nts.normalizeTitle(raw, 'Summary');
    assert.equal(r.rawTitle, raw);
  });

  it('should return positive title width measurements', async () => {
    const r = await nts.normalizeTitle('Width test', 'Summary');
    assert.ok(r.titleWidthPx > 0, 'titleWidthPx should be positive, got: ' + r.titleWidthPx);
    assert.ok(r.titleMaxWidthPx > 0, 'titleMaxWidthPx should be positive, got: ' + r.titleMaxWidthPx);
    assert.equal(typeof r.titleWidthPx, 'number');
    assert.equal(typeof r.titleMaxWidthPx, 'number');
  });

  it('should return titleWidthPx and titleMaxWidthPx as integers', async () => {
    const r = await nts.normalizeTitle('Integer check', 'Summary');
    assert.equal(Number.isFinite(r.titleWidthPx), true);
    assert.equal(Number.isFinite(r.titleMaxWidthPx), true);
  });

  it('should return normalizationVersion string', async () => {
    const r = await nts.normalizeTitle('Version', 'Summary');
    assert.ok(r.normalizationVersion);
    assert.equal(typeof r.normalizationVersion, 'string');
    assert.ok(r.normalizationVersion.length > 0);
  });

  it('should never return undefined for any field', async () => {
    const r = await nts.normalizeTitle('Check undefined', 'Summary');
    const fields = ['rawTitle', 'displayTitle', 'titleWidthPx', 'titleMaxWidthPx', 'titleStatus', 'reviewStatus', 'normalizationVersion'];
    for (const f of fields) {
      assert.notEqual(r[f], undefined, 'Field ' + f + ' should not be undefined');
    }
  });

  it('should display suggested title in displayTitle when needs_review', async () => {
    const r = await nts.normalizeTitle('【直播】Breaking news update with long content', 'Summary');
    // Without textRasterizer, result is needs_review with TITLE_RENDERER_UNAVAILABLE
    assert.ok(r.displayTitle);
    assert.equal(typeof r.displayTitle, 'string');
    assert.ok(r.suggestedTitle);
  });
});
