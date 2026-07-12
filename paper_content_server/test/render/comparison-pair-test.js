#!/usr/bin/env node
// comparison-pair-test.js — Comparison Pair 渲染器单元测试
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createComparisonPairRenderer, renderComparisonPair } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

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

// 9. renderer.render 返回 frame
var renderer = createComparisonPairRenderer();
renderer.render({ items: [{ title: 'A' }, { title: 'B' }] }, 'prof').then(function(result) {
  t('RENDER_RETURNS_FRAME', result && Buffer.isBuffer(result.frame), '');
  t('RENDER_FRAME_ID_PREFIX', typeof result.frameId === 'string' && result.frameId.indexOf('comparison_pair:') === 0, '');
  t('RENDER_PROFILE', result.profileId === 'prof', '');

  // 10. canRender
  t('CAN_RENDER_2_ITEMS', renderer.canRender({ items: [{}, {}] }) === true, '');
  t('CAN_RENDER_4_ITEMS', renderer.canRender({ items: [1,2,3,4] }) === true, '');
  t('CANNOT_RENDER_1_ITEM', renderer.canRender({ items: [1] }) === false, '');
  t('CANNOT_RENDER_NULL', renderer.canRender(null) === false, '');

  // 11. render null 返回 null
  return renderer.render(null, 'x');
}).then(function(r) {
  t('RENDER_NULL_RETURNS_NULL', r === null, '');
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(e) {
  console.log('CRASH: ' + e.message);
  process.exit(1);
});
