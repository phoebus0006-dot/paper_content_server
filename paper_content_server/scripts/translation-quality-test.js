#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..');
var mod = require(path.join(ROOT, 'server.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

// === 1. isTextSemanticallyComplete — production function ===
(function() {
  var sem = mod.isTextSemanticallyComplete;
  if (!sem) { test('SEMANTIC_FN_EXISTS', false, 'not exported'); return; }

  var r1 = sem('中国经济持续增长', '国家统计局数据显示GDP同比增长5.2%。', 'translated');
  test('GOOD_ZH_PASSES', r1.complete, r1.reasons.join(','));

  var r2 = sem('', '摘要内容。', 'original');
  test('EMPTY_TITLE_REJECTED', !r2.complete && r2.reasons.indexOf('EMPTY_TITLE') >= 0, r2.reasons.join(','));

  // Translated title has no Chinese characters → must reject
  var r3 = sem('Lido Pimienta', '哥伦比亚音乐家获大奖。', 'translated');
  test('TRANSLATED_NON_CHINESE_TITLE_REJECTED', !r3.complete && r3.reasons.indexOf('TRANSLATED_TITLE_NOT_CHINESE') >= 0, r3.reasons.join(','));

  // Hanging end
  var r4 = sem('欧盟计划对美国加征关税将', '欧盟计划对美国加征关税。', 'translated');
  test('HANGING_END_REJECTED', !r4.complete && r4.reasons.indexOf('HANGING_END') >= 0, r4.reasons.join(','));

  // Translated summary has no Chinese → must reject
  var r5 = sem('美国打击伊朗', 'The funeral in Tehran on Thursday for President.', 'translated');
  test('TRANSLATED_ENGLISH_SUMMARY_REJECTED', !r5.complete && r5.reasons.indexOf('TRANSLATED_SUMMARY_NOT_CHINESE') >= 0, r5.reasons.join(','));

  // Photo credit residue
  var r6 = sem('中国经济', 'Photo: John Smith. 经济数据良好。', 'translated');
  test('PHOTO_CREDIT_REJECTED', !r6.complete && r6.reasons.indexOf('PHOTO_CREDIT_RESIDUE') >= 0, r6.reasons.join(','));

  // Valid entity
  var r7 = sem('NATO外长会议召开', '北约外长会议讨论东欧安全局势。', 'translated');
  test('NATO_ENTITY_PASSES', r7.complete, r7.reasons.join(','));
})();

// === 2. normalizeEntitiesAndAcronyms — production function ===
(function() {
  var n = mod.normalizeEntitiesAndAcronyms;
  if (!n) { test('NEA_FN_EXISTS', false, 'not exported'); return; }

  test('OPENAI_FIXED', n('Open AI发布模型') === 'OpenAI发布模型', n('Open AI发布模型'));
  test('CHATGPT_FIXED', n('Chat GPT发布模型') === 'ChatGPT发布模型', n('Chat GPT发布模型'));
  test('NATO_FIXED', n('N A T O峰会') === 'NATO峰会', n('N A T O峰会'));
  test('NORMAL_UNCHANGED', n('中国经济持续增长') === '中国经济持续增长', n('中国经济持续增长'));
})();

// === 3. rewriteNewsTitle — production function ===
(function() {
  var rwt = mod.rewriteNewsTitle;
  if (!rwt) { test('RWT_FN_EXISTS', false, 'not exported'); return; }

  // Short title stays
  test('SHORT_TITLE_KEPT', rwt({ zhTitle: '中国经济持续增长' }) === '中国经济持续增长');

  // Title not ending with open quote
  var t1 = rwt({ zhTitle: '候选人称拨款"像腐败' });
  test('NO_OPEN_QUOTE_END', !/['"「『""]$/.test(t1), t1);
  test('NO_HANGING_END', !/(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/.test(t1), t1);

  // Entity preserved in title
  var t2 = rwt({ zhTitle: 'OpenAI 发布 o3 模型引起关注' });
  test('ENTITY_OPENAI_PRESERVED', t2.indexOf('OpenAI') >= 0, t2);

  var t3 = rwt({ zhTitle: 'NATO 秘书长宣布新战略' });
  test('ENTITY_NATO_PRESERVED', t3.indexOf('NATO') >= 0, t3);
})();

// === 4. rewriteNewsSummary — production function ===
(function() {
  var rws = mod.rewriteNewsSummary;
  if (!rws) { test('RWS_FN_EXISTS', false, 'not exported'); return; }

  // Summary must end with sentence punctuation
  var s1 = rws({ zhSummary: '测试摘要没有句号' });
  test('ENDS_WITH_PERIOD', /[。！？]/.test(s1[s1.length - 1]), s1);

  // Photo credit cleaned
  var s2 = rws({ zhSummary: 'Photo: John Smith. 经济数据良好。' });
  test('PHOTO_CREDIT_CLEANED', s2.indexOf('Photo:') < 0, s2);

  // Continue reading cleaned
  var s3 = rws({ zhSummary: '经济数据良好。Continue reading...' });
  test('CONTINUE_READING_CLEANED', s3.indexOf('Continue reading') < 0, s3);

  // Not hanging on comma
  var s4 = rws({ zhSummary: '根据经济分析局的数据，美国的外国直接投资显著反弹。但一项更为全面的衡量指标显示，当把企业撤资、内部借贷以及其他资金流动计算在内后，走势便截然不同。' });
  test('NOT_HANGING_COMMA', s4.length < 15 || !/[，,、；]$/.test(s4), s4 + ' len=' + s4.length);
  test('ENDS_PROPERLY', /[。！？]/.test(s4[s4.length - 1]), s4);

  // Numbers preserved
  var s5 = rws({ zhSummary: '数据显示GDP同比增长5.2%，CPI上涨2.1%。' });
  test('GDP_PRESERVED', s5.indexOf('GDP') >= 0, s5);
  test('CPI_PRESERVED', s5.indexOf('CPI') >= 0, s5);
  test('NUMBERS_PRESERVED', /\d+/.test(s5), s5);
})();

// === 5. PROTECTED_ENTITIES — production constant ===
(function() {
  var pe = mod.PROTECTED_ENTITIES;
  if (!pe) { test('PROTECTED_ENTITIES_EXISTS', false, 'not exported'); return; }

  test('OPENAI_PROTECTED', pe.indexOf('OpenAI') >= 0);
  test('CHATGPT_PROTECTED', pe.indexOf('ChatGPT') >= 0);
  test('NATO_PROTECTED', pe.indexOf('NATO') >= 0);
  test('GDP_PROTECTED', pe.indexOf('GDP') >= 0);
  test('CEO_PROTECTED', pe.indexOf('CEO') >= 0);
})();

// === 6. evaluateNewsItemQuality — production function ===
(function() {
  var eq = mod.evaluateNewsItemQuality;
  if (!eq) { test('EQ_FN_EXISTS', false, 'not exported'); return; }

  var q1 = eq({ zhTitle: '中国经济持续增长', zhSummary: '国家统计局数据显示GDP同比增长5.2%。' });
  test('GOOD_ITEM_TITLE_PASSES', q1.titleComplete, 'title=' + q1.titleComplete + ' summary=' + q1.summaryComplete);

  var longTitle = '太长了太长了太长了太长了太长了太长了太长了太长了太长了';
  var q2 = eq({ zhTitle: longTitle, zhSummary: '摘要正常。' });
  test('LONG_TITLE_REJECTED', !q2.titleComplete, 'titleReasons=' + q2.titleReason + ' len=' + longTitle.length);
})();

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
