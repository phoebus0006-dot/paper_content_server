#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var mod = require(path.join(ROOT, 'server.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

var layoutNewsCard = mod.layoutNewsCard;
var NEWS_LAYOUT = mod.NEWS_LAYOUT;
if (!layoutNewsCard || !NEWS_LAYOUT) { test('LAYOUT_FN', false, 'not exported'); process.exit(1); }

test('CARD_W=' + NEWS_LAYOUT.cardW, NEWS_LAYOUT.cardW > 0, '');
test('CARD_H=' + NEWS_LAYOUT.cardH, NEWS_LAYOUT.cardH > 0, '');
test('TITLE_FONT=' + NEWS_LAYOUT.titleFont, NEWS_LAYOUT.titleFont >= 22, '');
test('SUMMARY_FONT=' + NEWS_LAYOUT.summaryFont, NEWS_LAYOUT.summaryFont >= 18, '');

var items = [
  { zhTitle: '中国经济持续增长', zhSummary: '国家统计局数据显示，中国经济保持增长态势，GDP同比增长5.2%。这一数据超出市场预期。专家表示经济复苏势头良好。' },
  { zhTitle: '欧盟宣布将对美国商品加征报复性关税', zhSummary: '欧盟委员会宣布，由于美国钢铝关税政策持续，欧盟将对美国商品加征报复性关税。此举可能引发新一轮贸易摩擦。专家对此表示担忧。' },
  { zhTitle: '全球央行货币政策分化加剧', zhSummary: '美联储维持高利率不变，欧洲央行和中国人民银行则采取不同策略。全球经济面临新的不确定性。市场正在密切关注各国央行下一步行动。' },
  { zhTitle: 'OpenAI 发布新一代AI模型', zhSummary: 'OpenAI发布了新一代人工智能模型，在推理能力和代码生成方面取得重大突破。该模型已向开发者开放。业界反响热烈。' },
  { zhTitle: '国际油价受地缘政治影响波动', zhSummary: '由于中东局势持续紧张，国际油价出现大幅波动。OPEC+表示将根据市场情况调整产量。投资者保持谨慎。' },
  { zhTitle: '科技巨头财报季表现分化', zhSummary: '苹果、谷歌和微软等科技巨头最新财报显示，AI相关业务增长强劲，但传统硬件销售面临压力。市场反应不一。' },
];

items.forEach(function(item, i) {
  var layout = layoutNewsCard(item, NEWS_LAYOUT);
  var row = Math.floor(i / 2);
  var y0 = NEWS_LAYOUT.HEADER_H + 4 + row * (NEWS_LAYOUT.cardH + NEWS_LAYOUT.ROW_GAP);
  var sumEndY = y0 + 3 + NEWS_LAYOUT.badgeH + 5 + NEWS_LAYOUT.titleFont + 5 + 3 * (NEWS_LAYOUT.summaryFont + 2);
  var overflow = layout.overflow || (sumEndY + NEWS_LAYOUT.summaryFont > y0 + NEWS_LAYOUT.cardH);

  test('CARD_' + (i+1) + '_TITLE_LINES=' + layout.titleLines, layout.titleLines <= 2, 'titleLines=' + layout.titleLines);
  test('CARD_' + (i+1) + '_SUMMARY_LINES=' + layout.summaryLineCount, layout.summaryLineCount === 3, 'summaryLines=' + layout.summaryLineCount + ' overflow=' + overflow);
  test('CARD_' + (i+1) + '_FONT', layout.summaryFontSize >= 18, 'font=' + layout.summaryFontSize);
  test('CARD_' + (i+1) + '_OVERFLOW', !overflow, '');
});

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
