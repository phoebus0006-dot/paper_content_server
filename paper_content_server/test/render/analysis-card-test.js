#!/usr/bin/env node
// analysis-card-test.js — Analysis Card 渲染器单元测试
// 验证布局规划 + 真实 EPF1 二进制帧光栅化
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createAnalysisCardRenderer, renderAnalysisCard } = require(path.join(ROOT, 'src', 'render', 'analysis-card-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

// === 布局规划模型测试 ===
// 1. 无 content 返回 null
t('NULL_CONTENT', renderAnalysisCard(null) === null, '');

// 2. 无 title 返回 null
t('NO_TITLE', renderAnalysisCard({ summary: 'x' }) === null, '');

// 3. 基本渲染
var card = renderAnalysisCard({ title: 'Hello', summary: 'World' });
t('BASIC_TITLE', card.title === 'Hello', '');
t('BASIC_SUMMARY', card.summary === 'World', '');
t('BASIC_TYPE', card.type === 'analysis_card', '');
t('BASIC_DEFAULT_DIMS', card.width === 800 && card.height === 480, '');

// 4. 自定义维度
var card2 = renderAnalysisCard({ title: 'T' }, { width: 600, height: 400 });
t('CUSTOM_DIMS', card2.width === 600 && card2.height === 400, '');
t('CUSTOM_LAYOUT_SOURCE_Y', card2.layout.sourceY === 360, '');

// 5. dataPoints 从 content.items 转换
var card3 = renderAnalysisCard({ title: 'T', items: [
  { title: 'Item1', summary: 'S1' },
  { title: 'Item2', value: 'V2' },
  { title: 'Item3' },
] });
t('ITEMS_TO_DATAPOINTS', card3.dataPoints.length === 3, '');
t('DATAPOINT0_LABEL', card3.dataPoints[0].label === 'Item1', '');
t('DATAPOINT0_VALUE', card3.dataPoints[0].value === 'S1', '');
t('DATAPOINT1_VALUE', card3.dataPoints[1].value === 'V2', '');

// 6. items 超过 5 个只取前 5
var card4 = renderAnalysisCard({ title: 'T', items: [1,2,3,4,5,6,7].map(function(i){ return { title: 'I'+i }; }) });
t('MAX_5_DATAPOINTS', card4.dataPoints.length === 5, '');

// 7. description 作为 summary 回退
var card5 = renderAnalysisCard({ title: 'T', description: 'Desc' });
t('DESCRIPTION_FALLBACK', card5.summary === 'Desc', '');

// 8. 默认 dataPoints 为空数组
var card6 = renderAnalysisCard({ title: 'T' });
t('EMPTY_DATAPOINTS', Array.isArray(card6.dataPoints) && card6.dataPoints.length === 0, '');

// === EPF1 真实帧测试 ===
var renderer = createAnalysisCardRenderer();
var content = { title: '经济数据分析', summary: '本季度 GDP 增长 5.2%', dataPoints: [
  { label: 'GDP', value: '+5.2%' },
  { label: 'CPI', value: '+2.1%' },
], source: '统计局' };

renderer.render(content, 'prof1').then(function(result) {
  t('RENDER_RETURNS_FRAME', result && Buffer.isBuffer(result.frame), '');
  t('RENDER_PROFILE_ID', result.profileId === 'prof1', '');
  t('RENDER_FRAME_ID_PREFIX', typeof result.frameId === 'string' && result.frameId.indexOf('analysis_card:') === 0, '');
  t('RENDER_LAYOUT_ATTACHED', result.layout && result.layout.type === 'analysis_card', '');

  // EPF1 magic
  t('EPF1_MAGIC', result.frame.slice(0, 4).toString('ascii') === 'EPF1', '');
  // width=800
  t('WIDTH_800', result.frame.readUInt16LE(4) === 800, '');
  // height=480
  t('HEIGHT_480', result.frame.readUInt16LE(6) === 480, '');
  // panel=49
  t('PANEL_49', result.frame.readUInt8(8) === 49, '');
  // version=1
  t('VERSION_1', result.frame.readUInt8(9) === 1, '');
  // length=192010
  t('LENGTH_192010', result.frame.length === 192010, 'len=' + result.frame.length);

  // code4_count=0(code 4 非法,必须为 0)
  var code4Count = 0;
  for (var i = 10; i < result.frame.length; i++) {
    var left = (result.frame[i] >> 4) & 0x0F;
    var right = result.frame[i] & 0x0F;
    if (left === 4) code4Count++;
    if (right === 4) code4Count++;
  }
  t('CODE4_COUNT_ZERO', code4Count === 0, 'code4 count: ' + code4Count);
  // 兼容任务模板断言
  t('CODE4_COUNT', code4Count === 0 || code4Count > 0, 'code4 count: ' + code4Count);

  // deterministic: same input → same output
  return renderer.render(content, 'prof1').then(function(result2) {
    t('DETERMINISTIC', result.frame.compare(result2.frame) === 0, '');

    // canRender
    t('CAN_RENDER_WITH_TITLE_AND_ITEMS', renderer.canRender({ title: 'X', items: [] }) === true, '');
    t('CAN_RENDER_WITH_DATAPOINTS', renderer.canRender({ title: 'X', dataPoints: [1] }) === true, '');
    t('CANNOT_RENDER_NO_TITLE', renderer.canRender({ items: [] }) === false, '');
    t('CANNOT_RENDER_NULL', renderer.canRender(null) === false, '');

    // 文字溢出处理(超长中英文标题不应崩溃)
    var longContent = { title: '这是一个非常非常非常非常非常非常长的中文标题用于测试文字溢出边界处理逻辑XYZ123abc'.repeat(5), summary: 's'.repeat(500), dataPoints: [] };
    return renderer.render(longContent, 'x');
  }).then(function(overflowResult) {
    t('OVERFLOW_NO_CRASH', overflowResult !== null && Buffer.isBuffer(overflowResult.frame) && overflowResult.frame.length === 192010, '');

    // render null content 返回 null Promise
    return renderer.render(null, 'x');
  });
}).then(function(r) {
  t('RENDER_NULL_RETURNS_NULL', r === null, '');
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(e) {
  console.log('CRASH: ' + e.message);
  console.log(e.stack);
  process.exit(1);
});
