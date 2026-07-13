// render-shadow.js — Shadow dual-run for R9 rendering comparison
// 对 legacy 和 orchestrator 用同一 normalized input 跑双跑,
// 只对真实 EPF1 frame 做字节级 Buffer.compare,并记录 sha256(前 16 hex)用于诊断。
// shadow 失败不影响 production:始终返回 legacy 结果。
// 通过 options.disable 可关闭 shadow 执行。
// legacy 和 orchestrator 必须是不同的函数对象(防止意外用同一个函数与自己比较)。
var crypto = require('crypto');

function createRenderShadow(legacyRenderFn, orchestratorRenderFn, logger, options) {
  if (typeof legacyRenderFn !== 'function' || typeof orchestratorRenderFn !== 'function') {
    throw new Error('legacy and orchestrator must be functions');
  }
  if (legacyRenderFn === orchestratorRenderFn) {
    throw new Error('legacy and orchestrator must be different functions');
  }
  logger = logger || {};
  if (typeof logger.warn !== 'function') {
    logger.warn = function() {};
  }
  options = options || {};

  var metrics = {
    runs: 0,
    mismatches: 0,
    shadowErrors: 0,
    disabled: 0,
    matches: 0,
    lastMismatchHash: null,
  };

  function shortHash(buf) {
    if (!Buffer.isBuffer(buf)) return null;
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  }

  function run(content, profileId, clock) {
    // flag off 时不执行 shadow,直接走 legacy
    if (options.disable) {
      metrics.disabled++;
      return legacyRenderFn(content, profileId, clock);
    }

    metrics.runs++;
    // Legacy production render(同一 normalized input + 同一 clock)
    return legacyRenderFn(content, profileId, clock).then(function(legacyResult) {
      // R9 orchestrator shadow render(同一 normalized input + 同一 clock)
      return orchestratorRenderFn(content, profileId, clock).then(function(shadowResult) {
        var match = false;
        var legacyHash = null;
        var shadowHash = null;

        if (legacyResult && shadowResult && legacyResult.frame && shadowResult.frame
            && Buffer.isBuffer(legacyResult.frame) && Buffer.isBuffer(shadowResult.frame)) {
          // 只比较真实 EPF1 frame 字节
          match = legacyResult.frame.length === shadowResult.frame.length
            && legacyResult.frame.compare(shadowResult.frame) === 0;
          legacyHash = shortHash(legacyResult.frame);
          shadowHash = shortHash(shadowResult.frame);
        }

        if (match) {
          metrics.matches++;
        } else {
          metrics.mismatches++;
          metrics.lastMismatchHash = { legacy: legacyHash, shadow: shadowHash };
          logger.warn('R9_SHADOW_MISMATCH: legacy=' + legacyHash + ' shadow=' + shadowHash
            + ' legacyLen=' + (legacyResult && legacyResult.frame ? legacyResult.frame.length : 0)
            + ' shadowLen=' + (shadowResult && shadowResult.frame ? shadowResult.frame.length : 0)
            + ' content=' + (content ? content.frameId || 'unknown' : 'null'));
        }
        // Always return legacy result — shadow does not change production output
        return legacyResult;
      }).catch(function(shadowErr) {
        metrics.shadowErrors++;
        logger.warn('R9_SHADOW_FAILED: ' + (shadowErr && shadowErr.message ? shadowErr.message : String(shadowErr)));
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
        lastMismatchHash: metrics.lastMismatchHash,
      };
    },
  };
}
module.exports = { createRenderShadow: createRenderShadow };
