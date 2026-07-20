#!/usr/bin/env node
// sequence-2x2-test.js — Sequence 2x2 渲染器单元测试
// 验证布局规划 + 真实 EPF1 二进制帧光栅化
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var { createSequence2x2Renderer, renderSequence2x2 } = require(path.join(ROOT, 'src', 'render', 'sequence-2x2-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

// === 布局规划模型测试 ===
// 1. 无 content 返回 null
t('NULL_CONTENT', renderSequence2x2(null) === null, '');

// 2. items 不是数组返回 null
t('NON_ARRAY_ITEMS', renderSequence2x2({ items: 'x' }) === null, '');

// 3. items 少于 4 个返回 null
t('THREE_ITEMS', renderSequence2x2({ items: [1,2,3] }) === null, '');
t('EMPTY_ITEMS', renderSequence2x2({ items: [] }) === null, '');

// 4. 基本渲染 (4 items)
var grid = renderSequence2x2({ items: [
  { title: 'A', summary: 'SA' },
  { title: 'B', summary: 'SB' },
  { title: 'C', summary: 'SC' },
  { title: 'D', summary: 'SD' },
] });
t('BASIC_TYPE', grid.type === 'sequence_2x2', '');
t('BASIC_CELLS_COUNT', grid.cells.length === 4, '');
t('BASIC_DEFAULT_DIMS', grid.width === 800 && grid.height === 480, '');
t('BASIC_GRID', grid.layout.gridRows === 2 && grid.layout.gridCols === 2, '');

// 5. cell 坐标正确
t('CELL0_ROW_COL', grid.cells[0].row === 0 && grid.cells[0].col === 0, '');
t('CELL1_ROW_COL', grid.cells[1].row === 0 && grid.cells[1].col === 1, '');
t('CELL2_ROW_COL', grid.cells[2].row === 1 && grid.cells[2].col === 0, '');
t('CELL3_ROW_COL', grid.cells[3].row === 1 && grid.cells[3].col === 1, '');

// 6. cell 位置正确 (800x480)
t('CELL0_XY', grid.cells[0].cellX === 0 && grid.cells[0].cellY === 0, '');
t('CELL1_X', grid.cells[1].cellX === 400, '');
t('CELL2_Y', grid.cells[2].cellY === 240, '');
t('CELL3_XY', grid.cells[3].cellX === 400 && grid.cells[3].cellY === 240, '');
t('CELL_WIDTH', grid.cells[0].cellWidth === 400, '');
t('CELL_HEIGHT', grid.cells[0].cellHeight === 240, '');

// 7. 自定义维度
var grid2 = renderSequence2x2({ items: [{},{},{},{}] }, { width: 1000, height: 500 });
t('CUSTOM_DIMS', grid2.width === 1000 && grid2.height === 500, '');
t('CUSTOM_CELL_WIDTH', grid2.cells[0].cellWidth === 500, '');
t('CUSTOM_CELL_HEIGHT', grid2.cells[0].cellHeight === 250, '');

// 8. 超过 4 个 items 只取前 4
var grid3 = renderSequence2x2({ items: [
  { title: '1' }, { title: '2' }, { title: '3' }, { title: '4' }, { title: '5' }, { title: '6' },
] });
t('MAX_4_CELLS', grid3.cells.length === 4, '');
t('FIRST_4_TITLES', grid3.cells[0].title === '1' && grid3.cells[3].title === '4', '');

// 9. description 作为 summary 回退
var grid4 = renderSequence2x2({ items: [
  { title: 'A', description: 'DA' }, { title: 'B', description: 'DB' },
  { title: 'C', description: 'DC' }, { title: 'D', description: 'DD' },
] });
t('DESC_FALLBACK', grid4.cells[0].summary === 'DA' && grid4.cells[3].summary === 'DD', '');

// === EPF1 真实帧测试 ===
var renderer = createSequence2x2Renderer();
var content = { items: [
  { title: '事件一', summary: '上午发生', imageUrl: 'http://1.png' },
  { title: '事件二', summary: '中午发生', imageUrl: null },
  { title: '事件三', summary: '下午发生', imageUrl: 'http://3.png' },
  { title: '事件四', summary: '晚间发生', imageUrl: null },
] };

renderer.render(content, 'p').then(function(result) {
  t('RENDER_RETURNS_FRAME', result && Buffer.isBuffer(result.frame), '');
  t('RENDER_FRAME_ID_PREFIX', typeof result.frameId === 'string' && result.frameId.indexOf('sequence_2x2:') === 0, '');
  t('RENDER_PROFILE', result.profileId === 'p', '');
  t('RENDER_LAYOUT_ATTACHED', result.layout && result.layout.type === 'sequence_2x2', '');

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
  // Cell0 (左上,红色 code 3 背景) 标题应有白色(code 1)文字
  var cell0TitleWhite = countCodeInRegion(decoded, 8, 8, 200, 45, 1);
  t('CELL0_TITLE_HAS_TEXT_PIXELS', cell0TitleWhite > 0, 'cell0TitleWhite=' + cell0TitleWhite);
  // Cell0 摘要应有黑色(code 0)文字
  var cell0SummaryBlack = countCodeInRegion(decoded, 8, 28, 200, 65, 0);
  t('CELL0_SUMMARY_HAS_TEXT_PIXELS', cell0SummaryBlack > 0, 'cell0SummaryBlack=' + cell0SummaryBlack);
  // Cell1 (右上,黄色 code 2 背景) 标题应有白色(code 1)文字
  var cell1TitleWhite = countCodeInRegion(decoded, 408, 8, 600, 45, 1);
  t('CELL1_TITLE_HAS_TEXT_PIXELS', cell1TitleWhite > 0, 'cell1TitleWhite=' + cell1TitleWhite);
  // Cell3 (右下,绿色 code 6 背景) 标题应有白色(code 1)文字
  var cell3TitleWhite = countCodeInRegion(decoded, 408, 248, 600, 285, 1);
  t('CELL3_TITLE_HAS_TEXT_PIXELS', cell3TitleWhite > 0, 'cell3TitleWhite=' + cell3TitleWhite);

  // === clock 注入 ===
  return renderer.render(content, 'p', 'seq-clock-1').then(function(clockResult) {
    t('FRAMEID_USES_CLOCK', clockResult.frameId === 'sequence_2x2:seq-clock-1', 'frameId=' + clockResult.frameId);
    t('FRAME_BYTES_INDEPENDENT_OF_CLOCK', result.frame.compare(clockResult.frame) === 0, '');
  }).then(function() {
    // deterministic
    return renderer.render(content, 'p').then(function(result2) {
      t('DETERMINISTIC', result.frame.compare(result2.frame) === 0, '');

      // canRender
      t('CAN_RENDER_4', renderer.canRender({ items: [1,2,3,4] }) === true, '');
      t('CAN_RENDER_5', renderer.canRender({ items: [1,2,3,4,5] }) === true, '');
      t('CANNOT_RENDER_3', renderer.canRender({ items: [1,2,3] }) === false, '');
      t('CANNOT_RENDER_NULL', renderer.canRender(null) === false, '');

      // 文字溢出处理(超长中英文标题不崩溃)
      var longContent = { items: [
        { title: '一'.repeat(300), summary: 's'.repeat(500) },
        { title: '二'.repeat(300), summary: 's'.repeat(500) },
        { title: '三'.repeat(300), summary: 's'.repeat(500) },
        { title: '四'.repeat(300), summary: 's'.repeat(500) },
      ] };
      return renderer.render(longContent, 'x');
    }).then(function(overflowResult) {
      t('OVERFLOW_NO_CRASH', overflowResult !== null && Buffer.isBuffer(overflowResult.frame) && overflowResult.frame.length === 192010, '');

      // 图片缺失 fallback:全部 imageUrl 为 null 时仍渲染成功
      var noImgContent = { items: [
        { title: 'NoImg1' }, { title: 'NoImg2' }, { title: 'NoImg3' }, { title: 'NoImg4' },
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
