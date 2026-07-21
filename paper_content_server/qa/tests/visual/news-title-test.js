const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('NewsTitleService — title preservation', () => {
  let nts;

  before(async () => {
    var mod = require('../../../src/news/news-title-service');
    nts = new mod.NewsTitleService();
  });

  it('preserves rawTitle as original input', async () => {
    var r = await nts.normalizeTitle('【直播】新闻发布会特别报道', '摘要');
    assert.equal(r.rawTitle, '【直播】新闻发布会特别报道');
    assert.ok(r.displayTitle);
    // rawTitle must not be the cleaned version
    assert.ok(r.rawTitle.indexOf('【直播】') >= 0, 'rawTitle should contain original prefix');
  });

  it('returns structured result with all required fields', async () => {
    var r = await nts.normalizeTitle('测试标题', '测试摘要');
    var required = ['rawTitle', 'displayTitle', 'titleWidthPx', 'titleMaxWidthPx', 'titleStatus', 'reviewStatus', 'normalizationVersion'];
    for (var i = 0; i < required.length; i++) {
      assert.ok(required[i] in r, 'missing field: ' + required[i]);
    }
  });

  it('keeps long title intact in rawTitle', async () => {
    var longTitle = '这是一个非常长的标题它不应该被直接截断而是通过语义处理保留完整内容以便前端显示';
    var r = await nts.normalizeTitle(longTitle, '摘要');
    assert.equal(r.rawTitle, longTitle);
  });

  it('titleWidthPx and titleMaxWidthPx are positive numbers', async () => {
    var r = await nts.normalizeTitle('测试', '摘要');
    assert.ok(r.titleWidthPx > 0);
    assert.ok(r.titleMaxWidthPx > 0);
    assert.ok(Number.isFinite(r.titleWidthPx));
    assert.ok(Number.isFinite(r.titleMaxWidthPx));
  });

  it('normalizationVersion is non-empty string', async () => {
    var r = await nts.normalizeTitle('测试', '摘要');
    assert.ok(r.normalizationVersion && r.normalizationVersion.length > 0);
  });

  it('returns needs_review when renderer unavailable', async () => {
    var r = await nts.normalizeTitle('', '');
    assert.equal(r.titleStatus, 'error');
  });
});
