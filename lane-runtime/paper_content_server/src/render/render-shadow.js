// render-shadow.js — Shadow dual-run for R9 rendering comparison
function createRenderShadow(legacyRenderFn, orchestratorRenderFn, logger) {
  logger = logger || {};

  function run(content, profileId) {
    // Legacy production render
    return legacyRenderFn(content, profileId).then(function(legacyResult) {
      // R9 orchestrator shadow render
      return orchestratorRenderFn(content, profileId).then(function(shadowResult) {
        var match = false;
        if (legacyResult && shadowResult && legacyResult.frame && shadowResult.frame) {
          match = legacyResult.frame.length === shadowResult.frame.length && legacyResult.frame.compare(shadowResult.frame) === 0;
        }
        if (!match) {
          logger.warn('R9_SHADOW_MISMATCH: content=' + (content ? content.frameId || 'unknown' : 'null') + ' legacyLen=' + (legacyResult ? legacyResult.frame.length : 0) + ' shadowLen=' + (shadowResult ? shadowResult.frame.length : 0));
        }
        // Always return legacy result — shadow does not change production output
        return legacyResult;
      }).catch(function(shadowErr) {
        logger.warn('R9_SHADOW_FAILED: ' + shadowErr.message);
        return legacyResult;
      });
    });
  }

  return { run: run };
}
module.exports = { createRenderShadow: createRenderShadow };
