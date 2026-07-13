// render-shadow.js — Shadow dual-run for R9 rendering comparison
// 对 legacy 和 orchestrator 用同一 normalized input 跑双跑,
// 只对真实 EPF1 frame 做字节级 Buffer.compare。
// shadow 失败不影响 production:始终返回 legacy 结果。
// 通过 options.disable 可关闭 shadow 执行。
function createRenderShadow(legacyRenderFn, orchestratorRenderFn, logger, options) {
  logger = logger || {};
  options = options || {};
  var metrics = {
    runs: 0,
    mismatches: 0,
    shadowErrors: 0,
    disabled: 0,
    matches: 0,
  };

  function run(content, profileId) {
    // flag off 时不执行 shadow,直接走 legacy
    if (options.disable) {
      metrics.disabled++;
      return legacyRenderFn(content, profileId);
    }

    metrics.runs++;
    // Legacy production render(同一 normalized input)
    return legacyRenderFn(content, profileId).then(function(legacyResult) {
      // R9 orchestrator shadow render(同一 normalized input)
      return orchestratorRenderFn(content, profileId).then(function(shadowResult) {
        var match = false;
        if (legacyResult && shadowResult && legacyResult.frame && shadowResult.frame
            && Buffer.isBuffer(legacyResult.frame) && Buffer.isBuffer(shadowResult.frame)) {
          // 只比较真实 EPF1 frame 字节
          match = legacyResult.frame.length === shadowResult.frame.length
            && legacyResult.frame.compare(shadowResult.frame) === 0;
        }
        if (match) {
          metrics.matches++;
        } else {
          metrics.mismatches++;
          logger.warn('R9_SHADOW_MISMATCH: content=' + (content ? content.frameId || 'unknown' : 'null')
            + ' legacyLen=' + (legacyResult ? legacyResult.frame.length : 0)
            + ' shadowLen=' + (shadowResult ? shadowResult.frame.length : 0));
        }
        // Always return legacy result — shadow does not change production output
        return legacyResult;
      }).catch(function(shadowErr) {
        metrics.shadowErrors++;
        logger.warn('R9_SHADOW_FAILED: ' + shadowErr.message);
        return legacyResult;
      });
    });
  }

  return {
    run: run,
    getMetrics: function() {
      return {
        runs: metrics.runs,
        mismatches: metrics.mismatches,
        shadowErrors: metrics.shadowErrors,
        disabled: metrics.disabled,
        matches: metrics.matches,
      };
    },
  };
}
module.exports = { createRenderShadow: createRenderShadow };
