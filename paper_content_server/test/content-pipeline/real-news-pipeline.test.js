const test = require('node:test');
const assert = require('node:assert');
const { safeTruncateSentences, buildNewsDisplayContent } = require('../../lib/news-pipeline');

test('News Pipeline: Semantic Truncation', async (t) => {
  await t.test('short text remains unchanged', () => {
    const res = safeTruncateSentences('这是一个短句子。', 40);
    assert.strictEqual(res, '这是一个短句子。');
  });

  await t.test('truncates at sentence boundary', () => {
    const text = '这是第一句。这是第二句。这是第三句，但因为太长了所以要被截断。';
    const res = safeTruncateSentences(text, 25);
    // It should include up to the first or second sentence
    // '这是第一句。这是第二句。' length = 12
    // '这是第一句。这是第二句。这是第三句，' length = 18
    assert.ok(res.endsWith('。') || res.endsWith('，'));
    assert.ok(res.length <= 25);
  });

  await t.test('hard truncates if no punctuation is available', () => {
    const text = '这是一个非常长且没有任何标点符号的文本所以无法安全截断只能硬生生切断加上省略号表示未完待续';
    const res = safeTruncateSentences(text, 20);
    assert.ok(res.endsWith('...'));
    assert.ok(res.length <= 20);
  });

  await t.test('buildNewsDisplayContent preserves raw data and applies truncation safely', () => {
    const article = {
      rawTitle: '超长标题超过40个字超长标题超过40个字超长标题超过40个字超长标题超过40个字超长标题超过40个字',
      rawContent: '这是长新闻内容的第一句。这是第二句。因为字数可能超过了75个字，所以必须要进行安全的截断测试，以确保算法能回退到完整的句子边界，而不是截断成半个词或者破损的标点符号。这样用户体验会更好。',
    };

    const res = buildNewsDisplayContent(article);

    assert.strictEqual(res.rawTitle, article.rawTitle);
    assert.strictEqual(res.rawContent, article.rawContent);
    assert.ok(res.displayTitle.endsWith('...'));
    assert.ok(res.displayTitle.length <= 40);
    assert.ok(res.displaySummary.endsWith('。'));
    assert.ok(res.displaySummary.length <= 76); // Max 75 + '。' if it gets appended
  });

  await t.test('buildNewsDisplayContent cleans up unnecessary source tags in displaySummary', () => {
    const article = {
      title: 'Normal Title',
      summary: '新闻内容。 (Photo/AFP) (Source: Reuters) 建议阅读原文。Continue reading...',
    };

    const res = buildNewsDisplayContent(article);
    assert.strictEqual(res.rawContent, article.summary);
    assert.ok(!res.displaySummary.includes('Photo/AFP'));
    assert.ok(!res.displaySummary.includes('建议阅读'));
    assert.ok(!res.displaySummary.includes('Continue reading'));
  });
});
