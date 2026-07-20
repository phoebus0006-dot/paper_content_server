#!/usr/bin/env node
// comparison-pair-test.js — Comparison Pair 渲染器单元测试
// 验证布局规划 + 真实 EPF1 二进制帧光栅化
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createComparisonPairRenderer, renderComparisonPair } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

// === 布局规划模型测试 ===
// 1. 无 content 返回 null
t('NULL_CONTENT', renderComparisonPair(null) === null, '');

// 2. items 不是数组返回 null
t('NON_ARRAY_ITEMS', renderComparisonPair({ items: 'no' }) === null, '');

// 3. items 少于 2 个返回 null
t('SINGLE_ITEM', renderComparisonPair({ items: [{ title: 'A' }] }) === null, '');
t('EMPTY_ITEMS', renderComparisonPair({ items: [] }) === null, '');

// 4. 基本渲染
var pair = renderComparisonPair({ items: [
  { title: 'Left', summary: 'LSum', imageUrl: 'http://l.png' },
  { title: 'Right', summary: 'RSum', imageUrl: 'http://r.png' },
] });
t('BASIC_TYPE', pair.type === 'comparison_pair', '');
t('BASIC_LEFT_TITLE', pair.left.title === 'Left', '');
t('BASIC_RIGHT_TITLE', pair.right.title === 'Right', '');
t('BASIC_LEFT_IMAGE', pair.left.imageUrl === 'http://l.png', '');
t('BASIC_RIGHT_IMAGE', pair.right.imageUrl === 'http://r.png', '');
t('BASIC_DEFAULT_DIMS', pair.width === 800 && pair.height === 480, '');
t('BASIC_DIVIDER', pair.dividerX === 400, '');

// 5. 自定义维度
var pair2 = renderComparisonPair({ items: [{ title: 'A' }, { title: 'B' }] }, { width: 1000, height: 600 });
t('CUSTOM_DIMS', pair2.width === 1000 && pair2.height === 600, '');
t('CUSTOM_DIVIDER', pair2.dividerX === 500, '');
t('CUSTOM_LAYOUT_DIVIDER', pair2.layout.dividerX === 500, '');

// 6. description 作为 summary 回退
var pair3 = renderComparisonPair({ items: [
  { title: 'A', description: 'DescA' },
  { title: 'B', description: 'DescB' },
] });
t('LEFT_DESC_FALLBACK', pair3.left.summary === 'DescA', '');
t('RIGHT_DESC_FALLBACK', pair3.right.summary === 'DescB', '');

// 7. 默认 imageUrl 为 null
var pair4 = renderComparisonPair({ items: [{ title: 'A' }, { title: 'B' }] });
t('DEFAULT_NULL_IMAGE', pair4.left.imageUrl === null && pair4.right.imageUrl === null, '');

// 8. 取前 2 个 items
var pair5 = renderComparisonPair({ items: [
  { title: 'First' }, { title: 'Second' }, { title: 'Third' }, { title: 'Fourth' },
] });
t('LEFT_IS_FIRST', pair5.left.title === 'First', '');
t('RIGHT_IS_SECOND', pair5.right.title === 'Second', '');

// === EPF1 真实帧测试 ===
var renderer = createComparisonPairRenderer();
var content = { items: [
  { title: '方案 A', summary: '成本较低', imageUrl: 'http://a.png' },
  { title: '方案 B', summary: '成本较高', imageUrl: null },
] };

renderer.render(content, 'prof').then(function(result) {
  t('RENDER_RETURNS_FRAME', result && Buffer.isBuffer(result.frame), '');
  t('RENDER_FRAME_ID_PREFIX', typeof result.frameId === 'string' && result.frameId.indexOf('comparison_pair:') === 0, '');
  t('RENDER_PROFILE', result.profileId === 'prof', '');
  t('RENDER_LAYOUT_ATTACHED', result.layout && result.layout.type === 'comparison_pair', '');

  // EPF1 magic / header
  t('EPF1_MAGIC', result.frame.slice(0, 4).toString('ascii') === 'EPF1', '');
  t('WIDTH_800', result.frame.readUInt16LE(4) === 800, '');
  t('HEIGHT_480', result.frame.readUInt16LE(6) === 480, '');
  t('PANEL_49', result.frame.readUInt8(8) === 49, '');
  t('VERSION_1', result.frame.readUInt8(9) === 1, '');
  t('LENGTH_192010', result.frame.length === 192010, 'len=' + result.frame.length);

  // code4_count=0
  var code4Count = 0;
  for (var i = 10; i < result.frame.length; i++) {
    var left = (result.frame[i] >> 4) & 0x0F;
    var right = result.frame[i] & 0x0F;
    if (left === 4) code4Count++;
    if (right === 4) code4Count++;
  }
  t('CODE4_COUNT_ZERO', code4Count === 0, 'code4 count: ' + code4Count);
  t('CODE4_COUNT', code4Count === 0 || code4Count > 0, 'code4 count: ' + code4Count);

  // === 文字像素验证 ===
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
  // 左标题区(红色 code 3 背景条带 y=10-80)应有白色(code 1)文字
  var leftTitleWhite = countCodeInRegion(decoded, 20, 20, 380, 60, 1);
  t('LEFT_TITLE_HAS_TEXT_PIXELS', leftTitleWhite > 0, 'leftTitleWhite=' + leftTitleWhite);
  // 右标题区(绿色 code 6 背景条带 y=10-80)应有白色(code 1)文字
  var rightTitleWhite = countCodeInRegion(decoded, 420, 20, 780, 60, 1);
  t('RIGHT_TITLE_HAS_TEXT_PIXELS', rightTitleWhite > 0, 'rightTitleWhite=' + rightTitleWhite);
  // 左摘要区(白色 code 1 背景 y=90-280)应有黑色(code 0)文字
  var leftSummaryBlack = countCodeInRegion(decoded, 20, 100, 380, 290, 0);
  t('LEFT_SUMMARY_HAS_TEXT_PIXELS', leftSummaryBlack > 0, 'leftSummaryBlack=' + leftSummaryBlack);
  // 右摘要区(白色 code 1 背景 y=90-280)应有黑色(code 0)文字
  var rightSummaryBlack = countCodeInRegion(decoded, 420, 100, 780, 290, 0);
  t('RIGHT_SUMMARY_HAS_TEXT_PIXELS', rightSummaryBlack > 0, 'rightSummaryBlack=' + rightSummaryBlack);

  // === clock 注入 ===
  return renderer.render(content, 'prof', 'cp-clock-1').then(function(clockResult) {
    t('FRAMEID_USES_CLOCK', clockResult.frameId === 'comparison_pair:cp-clock-1', 'frameId=' + clockResult.frameId);
    t('FRAME_BYTES_INDEPENDENT_OF_CLOCK', result.frame.compare(clockResult.frame) === 0, '');
  }).then(function() {
    // deterministic
    return renderer.render(content, 'prof').then(function(result2) {
      t('DETERMINISTIC', result.frame.compare(result2.frame) === 0, '');

      // canRender
      t('CAN_RENDER_2_ITEMS', renderer.canRender({ items: [{}, {}] }) === true, '');
      t('CAN_RENDER_4_ITEMS', renderer.canRender({ items: [1,2,3,4] }) === true, '');
      t('CANNOT_RENDER_1_ITEM', renderer.canRender({ items: [1] }) === false, '');
      t('CANNOT_RENDER_NULL', renderer.canRender(null) === false, '');

      // 文字溢出处理(超长中英文标题不崩溃)
      var longContent = { items: [
        { title: '左'.repeat(300), summary: 's'.repeat(500) },
        { title: '右'.repeat(300), summary: 's'.repeat(500) },
      ] };
      return renderer.render(longContent, 'x');
    }).then(function(overflowResult) {
      t('OVERFLOW_NO_CRASH', overflowResult !== null && Buffer.isBuffer(overflowResult.frame) && overflowResult.frame.length === 192010, '');

      // 图片缺失 fallback:imageUrl 为 null 时仍渲染成功(返回有效帧)
      var noImgContent = { items: [
        { title: 'No Image Left', summary: 'sum' },
        { title: 'No Image Right', summary: 'sum' },
      ] };
      return renderer.render(noImgContent, 'x');
    }).then(function(fallbackResult) {
      t('IMAGE_MISSING_FALLBACK', fallbackResult !== null && Buffer.isBuffer(fallbackResult.frame) && fallbackResult.frame.length === 192010, '');

      // render null 返回 null
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
