#!/usr/bin/env node
// sequence-2x2-test.js — Sequence 2x2 渲染器单元测试
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createSequence2x2Renderer, renderSequence2x2 } = require(path.join(ROOT, 'src', 'render', 'sequence-2x2-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

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

// 10. renderer.render 返回 frame
var renderer = createSequence2x2Renderer();
renderer.render({ items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }] }, 'p').then(function(result) {
  t('RENDER_RETURNS_FRAME', result && Buffer.isBuffer(result.frame), '');
  t('RENDER_FRAME_ID_PREFIX', typeof result.frameId === 'string' && result.frameId.indexOf('sequence_2x2:') === 0, '');
  t('RENDER_PROFILE', result.profileId === 'p', '');

  // 11. canRender
  t('CAN_RENDER_4', renderer.canRender({ items: [1,2,3,4] }) === true, '');
  t('CAN_RENDER_5', renderer.canRender({ items: [1,2,3,4,5] }) === true, '');
  t('CANNOT_RENDER_3', renderer.canRender({ items: [1,2,3] }) === false, '');
  t('CANNOT_RENDER_NULL', renderer.canRender(null) === false, '');

  // 12. render null 返回 null
  return renderer.render(null, 'x');
}).then(function(r) {
  t('RENDER_NULL_RETURNS_NULL', r === null, '');
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(e) {
  console.log('CRASH: ' + e.message);
  process.exit(1);
});
