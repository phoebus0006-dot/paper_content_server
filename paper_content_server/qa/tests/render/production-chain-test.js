#!/usr/bin/env node
// production-chain-test.js — 生产链路测试
// 验证 legacy render 和 shadow render 都产生真实 EPF1 帧,
// shadow mismatch 检测、flag off 时不执行、shadow 失败不影响 production。
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var { createRenderShadow } = require(path.join(ROOT, 'src', 'render', 'render-shadow'));
var { createAnalysisCardRenderer } = require(path.join(ROOT, 'src', 'render', 'analysis-card-renderer'));
var { createComparisonPairRenderer } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
var { createSequence2x2Renderer } = require(path.join(ROOT, 'src', 'render', 'sequence-2x2-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

function assertEpf1(name, result) {
  if (!result || !Buffer.isBuffer(result.frame)) {
    t(name + '_IS_BUFFER', false, 'no frame buffer');
    return;
  }
  t(name + '_MAGIC', result.frame.slice(0, 4).toString('ascii') === 'EPF1', '');
  t(name + '_WIDTH', result.frame.readUInt16LE(4) === 800, '');
  t(name + '_HEIGHT', result.frame.readUInt16LE(6) === 480, '');
  t(name + '_PANEL', result.frame.readUInt8(8) === 49, '');
  t(name + '_VERSION', result.frame.readUInt8(9) === 1, '');
  t(name + '_LENGTH', result.frame.length === 192010, 'len=' + result.frame.length);
}

var analysisRenderer = createAnalysisCardRenderer();
var comparisonRenderer = createComparisonPairRenderer();
var seqRenderer = createSequence2x2Renderer();

// 合法可渲染 content(带 frameId 供 shadow 日志识别)
var analysisContent = { title: '生产链路测试', summary: 'summary', dataPoints: [{ label: 'A', value: '1' }], frameId: 'chain-analysis' };
var pairContent = { items: [{ title: 'A' }, { title: 'B' }], frameId: 'chain-pair' };
var seqContent = { items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }], frameId: 'chain-seq' };

// 共享状态(供跨 then 读取)
var matchedMessages, matchingShadow, matchingResult;
var mismatchMessages, mismatchShadow, mismatchResult;
var disabledShadow, disabledResult, disabledMetrics;
var errorMessages, failingShadow, failingResult, failingMetrics;

// === 1. legacy render 产生真实 EPF1 帧 ===
analysisRenderer.render(analysisContent, 'default-v1').then(function(legacyResult) {
  assertEpf1('LEGACY', legacyResult);

  // === 2. shadow render 也产生真实 EPF1 帧(orchestrator 用同一 renderer 模拟) ===
  matchedMessages = [];
  matchingShadow = createRenderShadow(
    function(c, p) { return analysisRenderer.render(c, p); },
    function(c, p) { return analysisRenderer.render(c, p); },
    { warn: function(m) { matchedMessages.push(m); } }
  );
  return matchingShadow.run(analysisContent, 'default-v1');
}).then(function(r) {
  matchingResult = r;
  t('SHADOW_RETURNS_LEGACY_RESULT', r !== null && Buffer.isBuffer(r.frame), '');
  assertEpf1('SHADOW', r);
  t('SHADOW_MATCH_NO_WARN', matchedMessages.length === 0, 'warn=' + matchedMessages.length);
  var m = matchingShadow.getMetrics();
  t('SHADOW_MATCH_METRIC', m.matches === 1 && m.mismatches === 0, 'matches=' + m.matches + ' mismatches=' + m.mismatches);

  // === 3. shadow mismatch 检测(legacy=analysis 帧, shadow=comparison 帧,字节必然不同) ===
  mismatchMessages = [];
  mismatchShadow = createRenderShadow(
    function(c, p) { return analysisRenderer.render(analysisContent, p); },       // legacy: analysis frame
    function(c, p) { return comparisonRenderer.render(pairContent, p); },        // shadow: comparison frame
    { warn: function(m) { mismatchMessages.push(m); } }
  );
  return mismatchShadow.run(analysisContent, 'default-v1');
}).then(function(r) {
  mismatchResult = r;
  t('MISMATCH_RETURNS_LEGACY', r !== null && Buffer.isBuffer(r.frame), '');
  assertEpf1('MISMATCH_LEGACY', r);
  t('MISMATCH_WARN_LOGGED', mismatchMessages.length >= 1, 'warns=' + mismatchMessages.length);
  var m = mismatchShadow.getMetrics();
  t('MISMATCH_METRIC', m.mismatches === 1, 'mismatches=' + m.mismatches);

  // === 4. flag off 时 shadow 不执行(orchestrator 抛错也不应被调用) ===
  disabledShadow = createRenderShadow(
    function(c, p) { return analysisRenderer.render(c, p); },
    function(c, p) { throw new Error('shadow should not run when disabled'); },
    { warn: function() {} },
    { disable: true }
  );
  return disabledShadow.run(analysisContent, 'default-v1');
}).then(function(r) {
  disabledResult = r;
  t('DISABLED_RETURNS_LEGACY', r !== null && Buffer.isBuffer(r.frame), '');
  assertEpf1('DISABLED', r);
  var m = disabledShadow.getMetrics();
  t('DISABLED_METRIC', m.disabled === 1 && m.runs === 0, 'disabled=' + m.disabled + ' runs=' + m.runs);

  // === 5. shadow 失败不影响 production(orchestrator reject) ===
  errorMessages = [];
  failingShadow = createRenderShadow(
    function(c, p) { return analysisRenderer.render(c, p); },
    function(c, p) { return Promise.reject(new Error('orchestrator boom')); },
    { warn: function(m) { errorMessages.push(m); } }
  );
  return failingShadow.run(analysisContent, 'default-v1');
}).then(function(r) {
  failingResult = r;
  t('SHADOW_ERROR_RETURNS_LEGACY', r !== null && Buffer.isBuffer(r.frame), '');
  assertEpf1('SHADOW_ERROR', r);
  t('SHADOW_ERROR_LOGGED', errorMessages.length >= 1, 'warns=' + errorMessages.length);
  var m = failingShadow.getMetrics();
  t('SHADOW_ERROR_METRIC', m.shadowErrors === 1, 'shadowErrors=' + m.shadowErrors);

  // === 6. sequence renderer 在同一链路中也产生合法 EPF1 ===
  return seqRenderer.render(seqContent, 'default-v1');
}).then(function(seqResult) {
  assertEpf1('SEQ', seqResult);
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(e) {
  console.log('CRASH: ' + e.message);
  console.log(e.stack);
  process.exit(1);
});
