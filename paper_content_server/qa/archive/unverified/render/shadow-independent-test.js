#!/usr/bin/env node
// shadow-independent-test.js — Render Shadow 独立函数测试
// 验证 legacy 和 orchestrator 必须是不同函数对象(防止与自己比较);
// 验证 hash/mismatch/shadowError 指标被正确记录;clock 被透传到 legacy/orchestrator。
var path = require('path');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var { createRenderShadow } = require(path.join(ROOT, 'src', 'render', 'render-shadow'));
var { createAnalysisCardRenderer } = require(path.join(ROOT, 'src', 'render', 'analysis-card-renderer'));
var { createComparisonPairRenderer } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

function shortHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

// === 1. legacy === orchestrator 必须抛错 ===
var sameFn = function() { return Promise.resolve({ frame: Buffer.alloc(10) }); };
var threwSame = false;
try {
  createRenderShadow(sameFn, sameFn, { warn: function() {} });
} catch (e) {
  threwSame = (e.message || '').indexOf('different functions') >= 0;
}
t('SAME_FUNCTION_THROWS', threwSame, '');

// === 2. 非函数参数也抛错 ===
var threwNonFn = false;
try {
  createRenderShadow(null, function() {}, {});
} catch (e) {
  threwNonFn = true;
}
t('NON_FUNCTION_THROWS', threwNonFn, '');

// === 3. 两个不同函数对象(即使行为相同)应成功创建 ===
var analysisRenderer = createAnalysisCardRenderer();
var comparisonRenderer = createComparisonPairRenderer();
var created = false;
try {
  // 注意:两个不同的箭头/匿名函数对象,即使内部行为相同,引用也不相等
  createRenderShadow(
    function(c, p, clk) { return analysisRenderer.render(c, p, clk); },
    function(c, p, clk) { return analysisRenderer.render(c, p, clk); },
    { warn: function() {} }
  );
  created = true;
} catch (e) {
  // ignore
}
t('DIFFERENT_FUNCTION_OBJECTS_OK', created, '');

// === 4. clock 被透传到 legacy 和 orchestrator ===
var capturedClockLegacy = null;
var capturedClockShadow = null;
var clockShadow = createRenderShadow(
  function(c, p, clk) { capturedClockLegacy = clk; return Promise.resolve({ frame: Buffer.alloc(8, 0xAA) }); },
  function(c, p, clk) { capturedClockShadow = clk; return Promise.resolve({ frame: Buffer.alloc(8, 0xAA) }); },
  { warn: function() {} }
);
clockShadow.run({ frameId: 'X' }, 'prof', 'clock-XYZ').then(function(r) {
  t('CLOCK_PASSED_TO_LEGACY', capturedClockLegacy === 'clock-XYZ', 'clk=' + capturedClockLegacy);
  t('CLOCK_PASSED_TO_ORCH', capturedClockShadow === 'clock-XYZ', 'clk=' + capturedClockShadow);

  var m = clockShadow.getMetrics();
  t('CLOCK_RUN_COUNTS', m.runs === 1 && m.matches === 1, 'runs=' + m.runs + ' matches=' + m.matches);

  // === 5. mismatch 指标被记录,且 lastMismatchHash 包含 sha256 ===
  var mismatchWarns = [];
  var mismatchShadow = createRenderShadow(
    function(c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(16, 0x11) }); },
    function(c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(16, 0x22) }); },
    { warn: function(msg) { mismatchWarns.push(msg); } }
  );
  return mismatchShadow.run({ frameId: 'mis' }, 'prof', 'ck');
}).then(function() {
  var mismatchShadow2 = arguments[0]; // not directly accessible here
  // Re-fetch via closure (handled below)
}).then(function() {
  // Re-do mismatch shadow inline (the .then chain above didn't capture the var)
}).then(function() {
  // 验证:重新构造一个 mismatch shadow 测试指标
  var mismatchWarns2 = [];
  var ms = createRenderShadow(
    function(c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(16, 0x11) }); },
    function(c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(16, 0x22) }); },
    { warn: function(msg) { mismatchWarns2.push(msg); } }
  );
  return ms.run({ frameId: 'mis2' }, 'prof', 'ck').then(function() {
    var m = ms.getMetrics();
    t('MISMATCH_METRIC_RECORDED', m.mismatches === 1 && m.matches === 0, 'mis=' + m.mismatches + ' mat=' + m.matches);
    t('MISMATCH_WARN_LOGGED', mismatchWarns2.length >= 1, 'warns=' + mismatchWarns2.length);
    t('MISMATCH_HASH_RECORDED',
      m.lastMismatchHash && typeof m.lastMismatchHash.legacy === 'string' && m.lastMismatchHash.legacy.length === 16,
      'hash=' + JSON.stringify(m.lastMismatchHash));
    var expectedLegacy = shortHash(Buffer.alloc(16, 0x11));
    var expectedShadow = shortHash(Buffer.alloc(16, 0x22));
    t('MISMATCH_HASH_LEGACY_CORRECT', m.lastMismatchHash.legacy === expectedLegacy, 'got=' + m.lastMismatchHash.legacy + ' want=' + expectedLegacy);
    t('MISMATCH_HASH_SHADOW_CORRECT', m.lastMismatchHash.shadow === expectedShadow, 'got=' + m.lastMismatchHash.shadow + ' want=' + expectedShadow);

    // === 6. shadow error 不影响 production ===
    var errWarns = [];
    var es = createRenderShadow(
      function(c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(8, 0x33) }); },
      function(c, p, clk) { return Promise.reject(new Error('orchestrator boom')); },
      { warn: function(msg) { errWarns.push(msg); } }
    );
    return es.run({ frameId: 'err' }, 'prof', 'ck').then(function(r) {
      t('SHADOW_ERROR_RETURNS_LEGACY', r && r.frame.length === 8 && r.frame[0] === 0x33, '');
      var m2 = es.getMetrics();
      t('SHADOW_ERROR_METRIC', m2.shadowErrors === 1, 'errs=' + m2.shadowErrors);
      t('SHADOW_ERROR_WARN_LOGGED', errWarns.length >= 1 && errWarns[0].indexOf('R9_SHADOW_FAILED') >= 0, 'warn=' + errWarns[0]);

      // === 7. disable flag 跳过 shadow ===
      var ds = createRenderShadow(
        function(c, p, clk) { return Promise.resolve({ frame: Buffer.alloc(4) }); },
        function(c, p, clk) { throw new Error('should not be called when disabled'); },
        { warn: function() {} },
        { disable: true }
      );
      return ds.run({ frameId: 'dis' }, 'prof', 'ck').then(function(r2) {
        var m3 = ds.getMetrics();
        t('DISABLED_RETURNS_LEGACY', r2 && r2.frame.length === 4, '');
        t('DISABLED_METRIC', m3.disabled === 1 && m3.runs === 0, 'disabled=' + m3.disabled + ' runs=' + m3.runs);

        // === 8. 真实渲染器作为 legacy/orchestrator:相同函数对象比较应抛错 ===
        var realThrew = false;
        try {
          createRenderShadow(analysisRenderer.render, analysisRenderer.render, { warn: function() {} });
        } catch (e) {
          realThrew = (e.message || '').indexOf('different functions') >= 0;
        }
        t('REAL_RENDERER_SAME_BOUND_METHOD_THROWS', realThrew, '');

        // === 9. 真实渲染器配对(analysis vs comparison)必然 mismatch,但 legacy 帧正常返回 ===
        var realWarns = [];
        var realShadow = createRenderShadow(
          function(c, p, clk) { return analysisRenderer.render(c, p, clk); },
          function(c, p, clk) { return comparisonRenderer.render(c, p, clk); },
          { warn: function(msg) { realWarns.push(msg); } }
        );
        // Note: comparison requires items array, so we need a content that both can render.
        // Use comparison content (items) — analysis renderer accepts items as dataPoints fallback.
        var contentBoth = { title: 'X', items: [{ title: 'A' }, { title: 'B' }] };
        return realShadow.run(contentBoth, 'default-v1', 'real-clock').then(function(legacyResult) {
          t('REAL_SHADOW_RETURNS_LEGACY', legacyResult && Buffer.isBuffer(legacyResult.frame), '');
          t('REAL_SHADOW_LENGTH_192010', legacyResult.frame.length === 192010, 'len=' + legacyResult.frame.length);
          var m4 = realShadow.getMetrics();
          t('REAL_SHADOW_MISMATCH_RECORDED', m4.mismatches === 1, 'mis=' + m4.mismatches);
          t('REAL_SHADOW_MISMATCH_HASH_PRESENT', m4.lastMismatchHash !== null, '');

          console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
          process.exit(ec);
        });
      });
    });
  });
}).catch(function(e) {
  console.log('CRASH: ' + e.message);
  console.log(e.stack);
  process.exit(1);
});
