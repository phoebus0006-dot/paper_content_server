#!/usr/bin/env node
// render-shadow-meaningful-test.js — Verifies the render shadow compares two
// genuinely INDEPENDENT pipelines (legacy color-block adapter vs. orchestrator
// text-rasterizing adapter) and records meaningful frame-difference metrics.
//
// The legacy and orchestrator adapters live in separate modules with different
// underlying implementations, so the same input yields different frames — a
// real shadow comparison rather than two closures calling one function.
//
// Tests:
//   FUNCTION_OBJECTS_DIFFERENT   — legacy.render !== orchestrator.render
//   IMPLEMENTATIONS_DIFFERENT    — adapters come from different modules
//   MATCH_RECORDED               — identical outputs -> match=true
//   MISMATCH_RECORDED            — real adapters -> different outputs -> mismatch
//   PIXEL_DIFF_RECORDED          — pixelDifferenceCount > 0 for real adapters
//   LEGACY_FAILURE_NON_BLOCKING  — legacy throws -> production (orchestrator) frame still returned
//   ORCHESTRATOR_FRAME_RETURNED  — shadow returns the orchestrator frame
//   FLAG_OFF_ZERO_SHADOW_CALLS   — disable=true -> no shadow execution
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var { createRenderShadow } = require(path.join(ROOT, 'src', 'render', 'render-shadow'));
var { createLegacyShadowAdapter } = require(path.join(ROOT, 'src', 'render', 'legacy-shadow-adapter'));
var { createOrchestratorShadowAdapter } = require(path.join(ROOT, 'src', 'render', 'orchestrator-shadow-adapter'));

var ec = 0, pass = 0, fail = 0;
function t(n, o, d) {
  console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : ''));
  if (o) pass++; else { ec = 1; fail++; }
}

function shortHash(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

// Content both adapters render as analysis_card (title + items).
var ANALYSIS_CONTENT = {
  title: 'Shadow Meaningful Test',
  summary: 'Compare legacy and orchestrator pipelines',
  items: [
    { title: 'Alpha', value: '1' },
    { title: 'Beta', value: '2' },
  ],
};

async function run() {
  var legacyAdapter = createLegacyShadowAdapter();
  var orchestratorAdapter = createOrchestratorShadowAdapter();

  // === 1. FUNCTION_OBJECTS_DIFFERENT ===
  t('FUNCTION_OBJECTS_DIFFERENT',
    typeof legacyAdapter.render === 'function'
      && typeof orchestratorAdapter.render === 'function'
      && legacyAdapter.render !== orchestratorAdapter.render,
    'legacy and orchestrator render fns must be distinct objects');

  // === 2. IMPLEMENTATIONS_DIFFERENT ===
  // The adapters expose a `source` identifying their module; they must come
  // from different modules (not two closures over one function).
  t('IMPLEMENTATIONS_DIFFERENT',
    legacyAdapter.source !== orchestratorAdapter.source
      && legacyAdapter.name !== orchestratorAdapter.name
      && legacyAdapter.source === 'legacy-shadow-adapter.js'
      && orchestratorAdapter.source === 'orchestrator-shadow-adapter.js',
    'legacy=' + legacyAdapter.source + ' orch=' + orchestratorAdapter.source);

  // Sanity: both adapters produce real EPF1 frames for the same input, and
  // those frames DIFFER (legacy = color blocks only, orchestrator = + text).
  var legacyDirect = await legacyAdapter.render(ANALYSIS_CONTENT, 'default-v1', 'm-clock');
  var orchDirect = await orchestratorAdapter.render(ANALYSIS_CONTENT, 'default-v1', 'm-clock');
  t('ADAPTERS_PRODUCE_FRAMES',
    !!legacyDirect && !!orchDirect
      && Buffer.isBuffer(legacyDirect.frame) && Buffer.isBuffer(orchDirect.frame)
      && legacyDirect.frame.length === 192010 && orchDirect.frame.length === 192010,
    'legacyLen=' + (legacyDirect && legacyDirect.frame ? legacyDirect.frame.length : 0)
      + ' orchLen=' + (orchDirect && orchDirect.frame ? orchDirect.frame.length : 0));
  t('ADAPTER_FRAMES_DIFFER',
    legacyDirect.frame.compare(orchDirect.frame) !== 0,
    'legacyHash=' + shortHash(legacyDirect.frame) + ' orchHash=' + shortHash(orchDirect.frame));

  // === 3. MATCH_RECORDED ===
  // Two stub fns returning the SAME buffer -> match=true.
  var sameBuf = Buffer.alloc(192, 0x7a);
  var matchShadow = createRenderShadow(
    function () { return Promise.resolve({ frame: Buffer.from(sameBuf) }); },
    function () { return Promise.resolve({ frame: Buffer.from(sameBuf) }); },
    { warn: function () {} }
  );
  await matchShadow.run({ frameId: 'match' }, 'default-v1', 'c1');
  var matchMetrics = matchShadow.getMetrics();
  t('MATCH_RECORDED',
    matchMetrics.lastComparison.match === true && matchMetrics.matches === 1,
    'match=' + matchMetrics.lastComparison.match + ' matches=' + matchMetrics.matches);

  // === 4. MISMATCH_RECORDED ===
  // Real adapters (different implementations) on the same input -> mismatch.
  var mismatchShadow = createRenderShadow(
    legacyAdapter.render,
    orchestratorAdapter.render,
    { warn: function () {} }
  );
  await mismatchShadow.run(ANALYSIS_CONTENT, 'default-v1', 'm-clock');
  var mismatchMetrics = mismatchShadow.getMetrics();
  t('MISMATCH_RECORDED',
    mismatchMetrics.lastComparison.match === false && mismatchMetrics.mismatches === 1,
    'match=' + mismatchMetrics.lastComparison.match + ' mis=' + mismatchMetrics.mismatches);

  // === 5. PIXEL_DIFF_RECORDED ===
  // Real EPF1 frames differ at text-pixel positions; pixelDifferenceCount > 0.
  var lc = mismatchMetrics.lastComparison;
  t('PIXEL_DIFF_RECORDED',
    typeof lc.pixelDifferenceCount === 'number' && lc.pixelDifferenceCount > 0
      && typeof lc.byteDifferenceCount === 'number' && lc.byteDifferenceCount > 0
      && typeof lc.differenceRatio === 'number' && lc.differenceRatio > 0,
    'pixelDiff=' + lc.pixelDifferenceCount + ' byteDiff=' + lc.byteDifferenceCount
      + ' ratio=' + lc.differenceRatio);
  // The recorded hashes must match the directly-rendered frames.
  t('LEGACY_HASH_RECORDED', lc.legacyHash === shortHash(legacyDirect.frame), 'got=' + lc.legacyHash);
  t('ORCH_HASH_RECORDED', lc.orchestratorHash === shortHash(orchDirect.frame), 'got=' + lc.orchestratorHash);
  // Durations are recorded as numbers.
  t('DURATIONS_RECORDED',
    typeof lc.legacyDurationMs === 'number' && typeof lc.orchestratorDurationMs === 'number',
    'legacy=' + lc.legacyDurationMs + ' orch=' + lc.orchestratorDurationMs);

  // === 6 + 7. LEGACY_FAILURE_NON_BLOCKING + ORCHESTRATOR_FRAME_RETURNED ===
  // productionSide='orchestrator': orchestrator is production (returned),
  // legacy is the shadow comparison. When legacy throws, production frame is
  // still returned, and errorSide='legacy'.
  var legacyThrowCalls = 0;
  var failShadow = createRenderShadow(
    function () { legacyThrowCalls++; throw new Error('legacy boom'); },
    orchestratorAdapter.render,
    { warn: function () {} },
    { productionSide: 'orchestrator' }
  );
  var failResult;
  try {
    failResult = await failShadow.run(ANALYSIS_CONTENT, 'default-v1', 'f-clock');
  } catch (e) {
    t('LEGACY_FAILURE_NON_BLOCKING', false, 'threw: ' + e.message);
    throw e;
  }
  var failMetrics = failShadow.getMetrics();
  t('LEGACY_FAILURE_NON_BLOCKING',
    !!failResult && Buffer.isBuffer(failResult.frame) && failResult.frame.length === 192010
      && failMetrics.shadowErrors === 1
      && failMetrics.lastComparison.errorSide === 'legacy',
    'frameLen=' + (failResult && failResult.frame ? failResult.frame.length : 0)
      + ' shadowErrors=' + failMetrics.shadowErrors
      + ' errorSide=' + failMetrics.lastComparison.errorSide);

  // ORCHESTRATOR_FRAME_RETURNED: the returned frame must be the orchestrator's
  // frame (byte-identical to a direct orchestrator render), not legacy's.
  // The orchestrator frameId is 'analysis_card:<clock>' (no 'legacy:' prefix).
  t('ORCHESTRATOR_FRAME_RETURNED',
    !!failResult && failResult.frameId === 'analysis_card:f-clock'
      && failResult.frame.compare(orchDirect.frame) === 0,
    'frameId=' + (failResult && failResult.frameId) + ' bytesMatchOrch='
      + (failResult ? failResult.frame.compare(orchDirect.frame) === 0 : false));

  // Separate clean check: with productionSide='orchestrator' and BOTH sides
  // succeeding, the shadow returns the orchestrator frame (not legacy's).
  var orchReturnShadow = createRenderShadow(
    legacyAdapter.render,
    orchestratorAdapter.render,
    { warn: function () {} },
    { productionSide: 'orchestrator' }
  );
  var orchReturnResult = await orchReturnShadow.run(ANALYSIS_CONTENT, 'default-v1', 'o-clock');
  t('ORCHESTRATOR_FRAME_RETURNED_CLEAN',
    !!orchReturnResult && orchReturnResult.frameId === 'analysis_card:o-clock'
      && orchReturnResult.frame.compare(orchDirect.frame) === 0,
    'frameId=' + (orchReturnResult && orchReturnResult.frameId));

  // === 8. FLAG_OFF_ZERO_SHADOW_CALLS ===
  // disable=true -> shadow fn never called, production fn called once,
  // metrics.runs stays 0 and disabled increments.
  var shadowCalls = 0;
  var prodCalls = 0;
  var flagShadow = createRenderShadow(
    function () { prodCalls++; return Promise.resolve({ frame: Buffer.alloc(4, 0x55), frameId: 'prod' }); },
    function () { shadowCalls++; return Promise.resolve({ frame: Buffer.alloc(4, 0x66), frameId: 'shadow' }); },
    { warn: function () {} },
    { disable: true }
  );
  var flagResult = await flagShadow.run({ frameId: 'flag' }, 'default-v1', 'z-clock');
  var flagMetrics = flagShadow.getMetrics();
  t('FLAG_OFF_ZERO_SHADOW_CALLS',
    shadowCalls === 0 && prodCalls === 1
      && flagMetrics.runs === 0 && flagMetrics.disabled === 1
      && !!flagResult && flagResult.frameId === 'prod',
    'shadowCalls=' + shadowCalls + ' prodCalls=' + prodCalls
      + ' runs=' + flagMetrics.runs + ' disabled=' + flagMetrics.disabled);

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function (e) {
  console.log('CRASH: ' + (e && e.message ? e.message : e));
  console.log(e && e.stack ? e.stack : '');
  process.exit(1);
});
