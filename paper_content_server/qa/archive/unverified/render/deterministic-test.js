#!/usr/bin/env node
// deterministic-test.js — 渲染确定性测试
// 验证:相同 clock → 完全相同 frame + frameId;
// 不同 clock → 相同 frame 字节(frame 内容不依赖 clock),但 frameId 不同;
// 显式 clock 注入使 frameId 可重现。
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createAnalysisCardRenderer } = require(path.join(ROOT, 'src', 'render', 'analysis-card-renderer'));
var { createComparisonPairRenderer } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
var { createSequence2x2Renderer } = require(path.join(ROOT, 'src', 'render', 'sequence-2x2-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var analysisContent = {
  title: 'GDP Q2 Report',
  summary: 'Quarterly growth at 5.2 percent.',
  dataPoints: [{ label: 'GDP', value: '+5.2%' }, { label: 'CPI', value: '+2.1%' }],
  source: 'Bureau of Stats',
};
var pairContent = { items: [
  { title: 'Plan A', summary: 'Lower cost', imageUrl: null },
  { title: 'Plan B', summary: 'Higher cost', imageUrl: null },
] };
var seqContent = { items: [
  { title: 'Event A', summary: 'Morning' },
  { title: 'Event B', summary: 'Noon' },
  { title: 'Event C', summary: 'Afternoon' },
  { title: 'Event D', summary: 'Evening' },
] };

var analysisRenderer = createAnalysisCardRenderer();
var pairRenderer = createComparisonPairRenderer();
var seqRenderer = createSequence2x2Renderer();

async function run() {
  // === 1. Analysis Card: 相同 clock → 完全相同 frame + frameId ===
  var a1 = await analysisRenderer.render(analysisContent, 'default-v1', 'clock-A-001');
  var a2 = await analysisRenderer.render(analysisContent, 'default-v1', 'clock-A-001');
  t('AC_SAME_CLOCK_SAME_FRAME', a1.frame.compare(a2.frame) === 0, '');
  t('AC_SAME_CLOCK_SAME_FRAMEID', a1.frameId === a2.frameId, 'a1=' + a1.frameId + ' a2=' + a2.frameId);
  t('AC_FRAMEID_USES_CLOCK', a1.frameId === 'analysis_card:clock-A-001', 'frameId=' + a1.frameId);

  // === 2. Analysis Card: 不同 clock → 相同 frame,不同 frameId ===
  var a3 = await analysisRenderer.render(analysisContent, 'default-v1', 'clock-B-002');
  t('AC_DIFF_CLOCK_SAME_FRAME', a1.frame.compare(a3.frame) === 0, 'frame bytes must not depend on clock');
  t('AC_DIFF_CLOCK_DIFF_FRAMEID', a1.frameId !== a3.frameId, 'a1=' + a1.frameId + ' a3=' + a3.frameId);

  // === 3. Analysis Card: 无 clock → 默认 frameId 'analysis_card:0' ===
  var a4 = await analysisRenderer.render(analysisContent, 'default-v1');
  t('AC_NO_CLOCK_DEFAULT_FRAMEID', a4.frameId === 'analysis_card:0', 'frameId=' + a4.frameId);
  t('AC_NO_CLOCK_DETERMINISTIC', a4.frame.compare(a1.frame) === 0, 'no-clock frame should equal explicit-clock frame');

  // === 4. Comparison Pair: 相同 clock → 完全相同 frame ===
  var p1 = await pairRenderer.render(pairContent, 'default-v1', 'pair-clock-1');
  var p2 = await pairRenderer.render(pairContent, 'default-v1', 'pair-clock-1');
  t('CP_SAME_CLOCK_SAME_FRAME', p1.frame.compare(p2.frame) === 0, '');
  t('CP_SAME_CLOCK_SAME_FRAMEID', p1.frameId === p2.frameId, '');
  t('CP_FRAMEID_USES_CLOCK', p1.frameId === 'comparison_pair:pair-clock-1', 'frameId=' + p1.frameId);

  var p3 = await pairRenderer.render(pairContent, 'default-v1', 'pair-clock-2');
  t('CP_DIFF_CLOCK_DIFF_FRAMEID', p1.frameId !== p3.frameId, '');
  t('CP_DIFF_CLOCK_SAME_FRAME', p1.frame.compare(p3.frame) === 0, '');

  // === 5. Sequence 2x2: 相同 clock → 完全相同 frame ===
  var s1 = await seqRenderer.render(seqContent, 'default-v1', 'seq-clock-1');
  var s2 = await seqRenderer.render(seqContent, 'default-v1', 'seq-clock-1');
  t('SQ_SAME_CLOCK_SAME_FRAME', s1.frame.compare(s2.frame) === 0, '');
  t('SQ_SAME_CLOCK_SAME_FRAMEID', s1.frameId === s2.frameId, '');
  t('SQ_FRAMEID_USES_CLOCK', s1.frameId === 'sequence_2x2:seq-clock-1', 'frameId=' + s1.frameId);

  // === 6. 不同 content → 不同 frame (sanity check) ===
  var aDifferent = await analysisRenderer.render({ title: 'Different Title', summary: 'Different Summary' }, 'default-v1', 'clock-A-001');
  t('AC_DIFF_CONTENT_DIFF_FRAME', a1.frame.compare(aDifferent.frame) !== 0, 'different content should produce different frame bytes');

  // === 7. SHA256 长度合理(确定性输出可重现 hash) ===
  var crypto = require('crypto');
  var h1 = crypto.createHash('sha256').update(a1.frame).digest('hex');
  var h2 = crypto.createHash('sha256').update(a2.frame).digest('hex');
  t('AC_SAME_FRAME_HASH', h1 === h2, 'h1=' + h1.slice(0, 16) + ' h2=' + h2.slice(0, 16));

  // === 8. clock 是数字 ===
  var a5 = await analysisRenderer.render(analysisContent, 'default-v1', 12345);
  t('AC_NUMERIC_CLOCK_FRAMEID', a5.frameId === 'analysis_card:12345', 'frameId=' + a5.frameId);

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(e) {
  console.log('CRASH: ' + e.message);
  console.log(e.stack);
  process.exit(1);
});
