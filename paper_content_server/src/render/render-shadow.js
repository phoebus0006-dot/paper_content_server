// render-shadow.js — Meaningful shadow dual-run for R9 rendering comparison
//
// Runs the legacy and orchestrator render pipelines against the same
// normalized input + clock and records a rich set of comparison metrics:
//   legacyHash, orchestratorHash, match, byteDifferenceCount,
//   pixelDifferenceCount, differenceRatio, legacyDurationMs,
//   orchestratorDurationMs, errorSide
//
// Production vs. shadow selection is controlled by options.productionSide:
//   - 'legacy' (default): legacy is production (returned), orchestrator is the
//     shadow comparison. [preserves the historical contract]
//   - 'orchestrator': orchestrator is production (returned), legacy is the
//     shadow comparison. Used by the meaningful shadow so the new pipeline is
//     the one served while the legacy pipeline is exercised for comparison.
//
// Failure isolation:
//   - The shadow side failing never blocks the production frame (logged +
//     counted as shadowErrors, production result still returned).
//   - The production side failing propagates (there is no production frame to
//     return); errorSide records which side failed.
//   - A mismatch is logged and recorded in metrics only — it never changes the
//     returned production frame.
//
// options.disable short-circuits the whole shadow and returns the production
// frame directly (zero shadow calls).
var crypto = require('crypto');
var epf1 = require('../epaper/epf1');

var EPF1_TOTAL_BYTES = epf1.EPF1_CONSTANTS.TOTAL_BYTES;
var EPF1_HEADER_BYTES = epf1.EPF1_CONSTANTS.HEADER_BYTES;
var EPF1_TOTAL_PIXELS = epf1.EPF1_CONSTANTS.WIDTH * epf1.EPF1_CONSTANTS.HEIGHT;

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

  // Production side: which pipeline is served (returned). The other is the
  // shadow comparison. Default 'legacy' preserves the historical contract.
  var productionSide = (options.productionSide === 'orchestrator') ? 'orchestrator' : 'legacy';
  var productionFn = (productionSide === 'orchestrator') ? orchestratorRenderFn : legacyRenderFn;
  var shadowFn = (productionSide === 'orchestrator') ? legacyRenderFn : orchestratorRenderFn;
  var shadowName = (productionSide === 'orchestrator') ? 'legacy' : 'orchestrator';

  var metrics = {
    runs: 0,
    mismatches: 0,
    shadowErrors: 0,
    disabled: 0,
    matches: 0,
    lastMismatchHash: null,
    lastComparison: {
      legacyHash: null,
      orchestratorHash: null,
      match: null,
      byteDifferenceCount: 0,
      pixelDifferenceCount: 0,
      differenceRatio: 0,
      legacyDurationMs: 0,
      orchestratorDurationMs: 0,
      errorSide: null,
    },
  };

  function shortHash(buf) {
    if (!Buffer.isBuffer(buf)) return null;
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  }

  function countByteDifferences(a, b) {
    var max = Math.max(a.length, b.length);
    var count = 0;
    for (var i = 0; i < max; i++) {
      var av = i < a.length ? a[i] : -1;
      var bv = i < b.length ? b[i] : -1;
      if (av !== bv) count++;
    }
    return count;
  }

  // Pixel (palette-code) differences are only meaningful for real EPF1 frames.
  // Each payload byte packs two nibble codes; a differing byte may differ in
  // one or both nibbles. We count each differing nibble as one pixel.
  function countPixelDifferences(a, b) {
    if (a.length !== EPF1_TOTAL_BYTES || b.length !== EPF1_TOTAL_BYTES) return 0;
    var count = 0;
    for (var i = EPF1_HEADER_BYTES; i < EPF1_TOTAL_BYTES; i++) {
      if (a[i] !== b[i]) {
        var la = (a[i] >> 4) & 0x0F, ra = a[i] & 0x0F;
        var lb = (b[i] >> 4) & 0x0F, rb = b[i] & 0x0F;
        if (la !== lb) count++;
        if (ra !== rb) count++;
      }
    }
    return count;
  }

  // Run one render fn, capturing its outcome (result or error) and duration.
  // Never rejects — errors are surfaced via outcome.error so the comparison
  // can record errorSide without short-circuiting the other side.
  function timed(fn, content, profileId, clock) {
    var start = Date.now();
    return Promise.resolve().then(function () {
      return fn(content, profileId, clock);
    }).then(function (result) {
      return { result: result, error: null, durationMs: Date.now() - start };
    }, function (err) {
      return { result: null, error: err, durationMs: Date.now() - start };
    });
  }

  function run(content, profileId, clock) {
    // flag off: no shadow execution, return the production frame directly.
    if (options.disable) {
      metrics.disabled++;
      return productionFn(content, profileId, clock);
    }

    metrics.runs++;

    var legacyPromise = timed(legacyRenderFn, content, profileId, clock);
    var orchPromise = timed(orchestratorRenderFn, content, profileId, clock);

    return Promise.all([legacyPromise, orchPromise]).then(function (outcomes) {
      var legacyOutcome = outcomes[0];
      var orchOutcome = outcomes[1];
      var legacyResult = legacyOutcome.result;
      var orchResult = orchOutcome.result;

      var legacyHash = (legacyResult && Buffer.isBuffer(legacyResult.frame))
        ? shortHash(legacyResult.frame) : null;
      var orchHash = (orchResult && Buffer.isBuffer(orchResult.frame))
        ? shortHash(orchResult.frame) : null;

      var match = false;
      var byteDifferenceCount = 0;
      var pixelDifferenceCount = 0;
      var differenceRatio = 0;
      if (legacyResult && orchResult
          && Buffer.isBuffer(legacyResult.frame) && Buffer.isBuffer(orchResult.frame)) {
        match = legacyResult.frame.length === orchResult.frame.length
          && legacyResult.frame.compare(orchResult.frame) === 0;
        if (!match) {
          byteDifferenceCount = countByteDifferences(legacyResult.frame, orchResult.frame);
          pixelDifferenceCount = countPixelDifferences(legacyResult.frame, orchResult.frame);
          differenceRatio = EPF1_TOTAL_PIXELS > 0
            ? pixelDifferenceCount / EPF1_TOTAL_PIXELS : 0;
        }
      }

      var errorSide = null;
      if (legacyOutcome.error && orchOutcome.error) errorSide = 'both';
      else if (legacyOutcome.error) errorSide = 'legacy';
      else if (orchOutcome.error) errorSide = 'orchestrator';

      metrics.lastComparison = {
        legacyHash: legacyHash,
        orchestratorHash: orchHash,
        match: match,
        byteDifferenceCount: byteDifferenceCount,
        pixelDifferenceCount: pixelDifferenceCount,
        differenceRatio: differenceRatio,
        legacyDurationMs: legacyOutcome.durationMs,
        orchestratorDurationMs: orchOutcome.durationMs,
        errorSide: errorSide,
      };

      if (match) {
        metrics.matches++;
      } else {
        metrics.mismatches++;
        // Backward-compat: lastMismatchHash keeps the legacy/shadow naming used
        // by existing tests. legacyHash/shadow maps to legacy/orchestrator.
        metrics.lastMismatchHash = { legacy: legacyHash, shadow: orchHash };
        // Only emit a MISMATCH warning when both sides actually produced frames
        // (an error on one side is reported via R9_SHADOW_FAILED instead).
        if (!legacyOutcome.error && !orchOutcome.error) {
          logger.warn('R9_SHADOW_MISMATCH: legacy=' + legacyHash + ' orchestrator=' + orchHash
            + ' byteDiff=' + byteDifferenceCount + ' pixelDiff=' + pixelDifferenceCount
            + ' ratio=' + differenceRatio.toFixed(6)
            + ' content=' + (content ? content.frameId || 'unknown' : 'null'));
        }
      }

      var prodOutcome = (productionSide === 'orchestrator') ? orchOutcome : legacyOutcome;
      var shadowOutcome = (productionSide === 'orchestrator') ? legacyOutcome : orchOutcome;

      // Shadow failure is non-blocking: log + count, keep production.
      if (shadowOutcome.error) {
        metrics.shadowErrors++;
        var msg = (shadowOutcome.error && shadowOutcome.error.message)
          ? shadowOutcome.error.message : String(shadowOutcome.error);
        logger.warn('R9_SHADOW_FAILED: side=' + shadowName + ' err=' + msg);
      }

      // Production failure propagates — there is no production frame to return.
      if (prodOutcome.error) {
        throw prodOutcome.error;
      }

      return prodOutcome.result;
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
        lastComparison: metrics.lastComparison,
      };
    },
  };
}
module.exports = { createRenderShadow: createRenderShadow };
