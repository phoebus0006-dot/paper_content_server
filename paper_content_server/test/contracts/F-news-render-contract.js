#!/usr/bin/env node
// F-news-render-contract: production layoutNewsCard via shared function
var path=require('path');
var mod=require(path.join(__dirname,'..','..','server.js'));
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var lc=mod.layoutNewsCard,NL=mod.NEWS_LAYOUT;
if(!lc||!NL){t('FN_EXISTS',false,'');process.exit(1)}
t('CARDW',NL.cardW>0,'');t('CARDH',NL.cardH>0,'');t('TFONT',NL.titleFont>=22,'');t('SFONT',NL.summaryFont>=18,'');
var items=[
  {zhTitle:'中国经济持续增长',zhSummary:'国家统计局数据显示GDP增长5.2%。专家表示经济复苏势头良好。市场信心恢复中。'},
  {zhTitle:'欧盟宣布加征报复性关税',zhSummary:'欧盟委员会宣布对美国商品加征关税。此举可能引发贸易摩擦。市场表示担忧。'},
  {zhTitle:'全球央行政策分化加剧',zhSummary:'美联储维持利率不变。欧洲央行采取不同策略。市场密切关注。'},
  {zhTitle:'OpenAI发布新一代模型',zhSummary:'OpenAI发布了新AI模型。推理能力取得突破。已向开发者开放。'},
  {zhTitle:'国际油价波动',zhSummary:'中东局势紧张导致油价波动。OPEC+将调整产量。投资者保持谨慎。'},
  {zhTitle:'科技巨头财报分化',zhSummary:'AI业务增长强劲。传统硬件面临压力。市场反应不一。'},
];
items.forEach(function(item,i){
  var lay=lc(item,NL);
  t('C'+(i+1)+'_TLINES='+lay.titleLines,lay.titleLines<=2,'tl='+lay.titleLines);
  // Acceptance requires summaryLines = 2 or 3
  var ok2or3 = lay.summaryLineCount === 2 || lay.summaryLineCount === 3;
  t('C'+(i+1)+'_SLINES='+lay.summaryLineCount, ok2or3, 'sl='+lay.summaryLineCount+' font='+lay.summaryFontSize);
  t('C'+(i+1)+'_OVERFLOW',!lay.overflow,'');
});
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
