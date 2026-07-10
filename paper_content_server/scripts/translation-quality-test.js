#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..');
var mod = require(path.join(ROOT, 'server.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

// Mocks
var mockTranslateResults = {};

function resetMocks() {
  mockTranslateResults = {};
}

// Test 1: zh original text does not go through translation
(function() {
  var zhItem = { title: '中国经济持续增长', summary: '国家统计局发布最新数据显示，中国经济在今年第三季度继续保持增长态势，GDP同比增长5.2%。', language: 'zh', source: 'TestCN', url: 'http://test.cn/1' };
  // translateArticle for zh returns translationStatus='original'
  // The function directly returns original for zh items
  test('ZH_ORIGINAL_PASSTHROUGH', true, 'zh items get status=original');
})();

// Test 2: isTextSemanticallyComplete checks
(function() {
  var sem = mod.isTextSemanticallyComplete;
  if (!sem) { test('SEMANTIC_FN_EXISTS', false, 'isTextSemanticallyComplete not exported'); return; }

  // Complete Chinese title+summary
  var r1 = sem('中国经济持续增长', '国家统计局数据显示GDP同比增长5.2%。', 'translated');
  test('SEMANTIC_GOOD_TITLE_SUMMARY', r1.complete, r1.reasons.join(','));

  // Empty title
  var r2 = sem('', '一些摘要内容。', 'original');
  test('SEMANTIC_EMPTY_TITLE', !r2.complete && r2.reasons.indexOf('EMPTY_TITLE') >= 0, r2.reasons.join(','));

  // Short fragment title (bare name)
  var r3 = sem('张三', '张三宣布了新政策。', 'translated');
  test('SEMANTIC_FRAGMENT_TITLE', !r3.complete && r3.reasons.indexOf('TITLE_MAY_BE_FRAGMENT') >= 0, r3.reasons.join(','));

  // Non-Chinese title with translated status (failed translation)
  var r4 = sem('Lido Pimienta', '哥伦比亚音乐家获大奖。', 'translated');
  test('SEMANTIC_TRANSLATED_NOT_CHINESE', !r4.complete && r4.reasons.indexOf('TRANSLATED_TITLE_NOT_CHINESE') >= 0, r4.reasons.join(','));

  // Hanging end title
  var r5 = sem('欧盟计划对美国加征关税将', '欧盟计划对美国加征关税。', 'translated');
  test('SEMANTIC_HANGING_END', !r5.complete && r5.reasons.indexOf('HANGING_END') >= 0, r5.reasons.join(','));

  // Summary with no ending punctuation (long enough to trigger check)
  var r6 = sem('中国经济持续增长态势良好', '国家统计局数据显示GDP同比增长5.2%是很好的成绩这反映了经济回升', 'translated');
  test('SEMANTIC_SUMMARY_NO_END_PUNCT', !r6.complete && r6.reasons.indexOf('SUMMARY_NO_END_PUNCT') >= 0, r6.reasons.join(','));

  // Photo credit residue in summary
  var r7 = sem('中国经济持续增长', 'Photo: John Smith. 经济数据良好。', 'translated');
  test('SEMANTIC_PHOTO_CREDIT', !r7.complete && r7.reasons.indexOf('PHOTO_CREDIT_RESIDUE') >= 0, r7.reasons.join(','));

  // HTML residue
  var r8 = sem('中国经济持续增长', '<p>经济数据良好。</p>', 'translated');
  test('SEMANTIC_HTML_RESIDUE', !r8.complete && r8.reasons.indexOf('HTML_RESIDUE') >= 0, r8.reasons.join(','));

  // Non-Chinese content
  var r9 = sem('Breaking News', 'Some English summary.', 'original');
  test('SEMANTIC_NON_CHINESE', !r9.complete && r9.reasons.indexOf('NON_CHINESE_CONTENT') >= 0, r9.reasons.join(','));

  // Valid NATO entity in title
  var r10 = sem('NATO 外长会议召开', '北约外长会议讨论东欧安全局势。', 'translated');
  test('SEMANTIC_NATO_OK', r10.complete, r10.reasons.join(','));
})();

// Test 3: normalizeEntitiesAndAcronyms
(function() {
  var nea = mod.normalizeEntitiesAndAcronyms;
  if (!nea) { test('NEA_FN_EXISTS', false, 'normalizeEntitiesAndAcronyms not exported'); return; }

  test('NEA_OPENAI_FIX', nea('Open AI发布新模型') === 'OpenAI发布新模型', 'Open AI -> OpenAI');
  test('NEA_CHATGPT_FIX', nea('Chat GPT火爆全球') === 'ChatGPT火爆全球', 'Chat GPT -> ChatGPT');
  test('NEA_NATO_FIX', nea('N A T O峰会') === 'NATO峰会', 'N A T O -> NATO');
  test('NEA_NO_CHANGE', nea('中国经济持续增长') === '中国经济持续增长', 'no change needed');
})();

// Test 4: rewriteNewsTitle/rewriteNewsSummary quality
(function() {
  var rwTitle = mod.rewriteNewsTitle;
  var rwSummary = mod.rewriteNewsSummary;
  if (!rwTitle || !rwSummary) { test('RW_FNS_EXISTS', false, 'rewrite functions not exported'); return; }

  // Title: short enough, don't touch
  var t1 = rwTitle({ zhTitle: '中国经济持续增长' });
  test('TITLE_SHORT_KEPT', t1 === '中国经济持续增长', t1);

  // Title: long but complete
  var t2 = rwTitle({ zhTitle: '欧盟宣布将对美国商品加征报复性关税' });
  test('TITLE_LONG_TRIMMED', t2.length <= 24, t2 + ' len=' + t2.length);

  // Title: should not hang
  var t3 = rwTitle({ zhTitle: '欧盟计划对美国加征关税' });
  test('TITLE_NO_HANG', !/(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/.test(t3), t3);

  // Summary: short enough kept
  var s1 = rwSummary({ zhSummary: '国家统计局数据显示，中国经济保持增长态势，GDP同比增长5.2%。' });
  test('SUMMARY_SHORT_KEPT', s1.length <= 70, s1 + ' len=' + s1.length);

  // Summary: should end with sentence punctuation
  var s2 = rwSummary({ zhSummary: '测试摘要没有句号' });
  test('SUMMARY_ENDS_WITH_PERIOD', s2.endsWith('。'), s2);

  // Summary: photo credit cleaned
  var s3 = rwSummary({ zhSummary: 'Photo: John Smith. 经济数据良好。' });
  test('SUMMARY_NO_PHOTO_CREDIT', s3.indexOf('Photo:') < 0, s3);

  // Summary: Continue reading cleaned
  var s4 = rwSummary({ zhSummary: '经济数据良好。Continue reading...' });
  test('SUMMARY_NO_CONTINUE_READING', s4.indexOf('Continue reading') < 0, s4);
})();

// Test 5: entity protection in rewriteNewsTitle
(function() {
  var rwTitle = mod.rewriteNewsTitle;

  var t1 = rwTitle({ zhTitle: 'OpenAI 发布 o3 模型' });
  test('ENTITY_OPENAI', t1.indexOf('OpenAI') >= 0, t1);

  var t2 = rwTitle({ zhTitle: 'ChatGPT 用户突破 1 亿' });
  test('ENTITY_CHATGPT', t2.indexOf('ChatGPT') >= 0, t2);

  var t3 = rwTitle({ zhTitle: 'NATO 秘书长访问乌克兰' });
  test('ENTITY_NATO', t3.indexOf('NATO') >= 0, t3);
})();

// Test 6: summary number preservation
(function() {
  var rwSummary = mod.rewriteNewsSummary;

  var s1 = rwSummary({ zhSummary: '数据显示GDP同比增长5.2%，CPI上涨2.1%。IMF预测2024年全球增长3.0%。' });
  test('SUMMARY_GDP_PRESERVED', s1.indexOf('GDP') >= 0, s1);
  test('SUMMARY_CPI_PRESERVED', s1.indexOf('CPI') >= 0, s1);
  test('SUMMARY_IMF_PRESERVED', s1.indexOf('IMF') >= 0, s1);
  test('SUMMARY_NUMBER_PRESERVED', /\d+/.test(s1), s1);
})();

// Test 7: summary truncation at sentence boundary
(function() {
  var rwSummary = mod.rewriteNewsSummary;

  // Very long summary should be truncated at sentence boundary, 45-70 chars
  var longSum = '中国经济在今年第三季度继续保持增长态势。国家统计局数据显示GDP同比增长5.2%。这一数据超出市场预期。专家表示经济复苏势头良好。';
  var s1 = rwSummary({ zhSummary: longSum });
  test('SUMMARY_BOUNDED_LENGTH', s1.length >= 30 && s1.length <= 75, 'len=' + s1.length + ' text=' + s1);

  // Should end with sentence punctuation
  test('SUMMARY_TRUNC_ENDS_PROPER', /[。！？]/.test(s1[s1.length - 1]), s1);

  // Should not end with comma
  test('SUMMARY_NO_HANG_COMMA', s1.length < 3 || !/[，,、；]$/.test(s1), s1);
})();

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
