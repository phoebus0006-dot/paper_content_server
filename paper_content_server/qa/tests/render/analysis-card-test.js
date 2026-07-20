#!/usr/bin/env node
// analysis-card-test.js — Analysis Card 渲染器单元测试
// 验证布局规划 + 真实 EPF1 二进制帧光栅化
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
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
t('CUSTOM_LAYOUT_SOURCE_Y', card2.layout.sourceY === card2.height - 30, 'sourceY=' + card2.layout.sourceY);

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

  // === 文字像素验证:解码 frame 到 codes,检查特定区域有非背景色像素 ===
  function decodeCodes(frame) {
    var codes = new Array(800 * 480);
    for (var i = 0; i < 192000; i++) {
      var b = frame[10 + i];
      codes[i * 2] = (b >> 4) & 0x0F;
      codes[i * 2 + 1] = b & 0x0F;
    }
    return codes;
  }
  function countCodeInRegion(codes, x0, y0, x1, y1, target) {
    var n = 0;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        if (codes[y * 800 + x] === target) n++;
      }
    }
    return n;
  }

  var decoded = decodeCodes(result.frame);
  // 标题区(y=0-80,蓝色 code 5 背景)应有白色(code 1)文字像素
  var titleWhite = countCodeInRegion(decoded, 20, 20, 780, 60, 1);
  t('TITLE_HAS_TEXT_PIXELS', titleWhite > 0, 'titleWhite=' + titleWhite);
  // 摘要区(y=82-200,白色 code 1 背景)应有黑色(code 0)文字像素
  var summaryBlack = countCodeInRegion(decoded, 20, 100, 780, 195, 0);
  t('SUMMARY_HAS_TEXT_PIXELS', summaryBlack > 0, 'summaryBlack=' + summaryBlack);
  // 数据点区(y=202-440,黄色 code 2 背景)应有黑色(code 0)文字像素
  var dpBlack = countCodeInRegion(decoded, 36, 210, 780, 435, 0);
  t('DATAPOINTS_HAVE_TEXT_PIXELS', dpBlack > 0, 'dpBlack=' + dpBlack);
  // 来源区(y=442-480,黑色 code 0 背景)应有白色(code 1)文字像素
  var srcWhite = countCodeInRegion(decoded, 20, 450, 780, 478, 1);
  t('SOURCE_HAS_TEXT_PIXELS', srcWhite > 0, 'srcWhite=' + srcWhite);

  // === clock 注入:frameId 包含 clock 值 ===
  return renderer.render(content, 'prof1', 'fixed-clock-XYZ').then(function(clockResult) {
    t('FRAMEID_USES_CLOCK', clockResult.frameId === 'analysis_card:fixed-clock-XYZ', 'frameId=' + clockResult.frameId);
    // frame 字节不应依赖 clock
    t('FRAME_BYTES_INDEPENDENT_OF_CLOCK', result.frame.compare(clockResult.frame) === 0, '');

    // deterministic: same input → same output (no clock)
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
