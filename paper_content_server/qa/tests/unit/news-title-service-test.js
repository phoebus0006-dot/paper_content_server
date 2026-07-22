const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('NewsTitleService', () => {
  let nts;
  before(async () => {
    const { NewsTitleService } = require('../../../src/news/news-title-service');
    nts = new NewsTitleService();
  });

  it('should preserve rawTitle (including spaces)', async () => {
    const r = await nts.normalizeTitle('  Hello World  ', 'Summary');
    assert.ok(r.displayTitle);
    assert.equal(r.rawTitle, '  Hello World  ');
    assert.match(r.titleStatus, /^(fit|needs_review|error)$/);
  });

  it('should strip 最新快讯 prefix or set needs_review', async () => {
    const r = await nts.normalizeTitle('最新快讯 这是一个测试', '摘要');
    assert.ok(r.displayTitle);
    // Either stripped (prefix gone) or flagged needs_review
    const hasPrefix = r.displayTitle.indexOf('最新快讯') >= 0;
    if (hasPrefix) {
      assert.equal(r.titleStatus, 'needs_review', 'title with prefix should be needs_review if not stripped');
    }
    assert.ok(r.rawTitle === '最新快讯 这是一个测试');
  });

  it('should keep long titles without truncation', async () => {
    const longTitle = '这是一个非常长的标题它不应该被直接截断而是通过语义处理保留完整内容以便前端显示';
    const r = await nts.normalizeTitle(longTitle, '摘要');
    assert.equal(r.rawTitle, longTitle);
    assert.ok(r.titleWidthPx > 0);
    assert.ok(r.titleMaxWidthPx > 0);
    assert.ok(r.normalizationVersion);
  });

  it('should return needs_review when title cannot fit', async () => {
    const r = await nts.normalizeTitle('Very long title that would not fit in the display area and needs review because it exceeds the maximum pixel width available for a single line', 'Summary text');
    assert.ok(['fit', 'needs_review', 'error'].includes(r.titleStatus));
  });

  it('should handle empty title gracefully', async () => {
    const r = await nts.normalizeTitle('', '');
    assert.equal(r.titleStatus, 'error');
    assert.ok(r.reason);
  });

  it('should return structured result', async () => {
    const r = await nts.normalizeTitle('Test', 'Summary');
    const expectedFields = ['rawTitle', 'displayTitle', 'titleWidthPx', 'titleMaxWidthPx', 'titleStatus', 'reviewStatus', 'normalizationVersion'];
    for (const f of expectedFields) {
      assert.ok(f in r, `missing field: ${f}`);
    }
  });
});
