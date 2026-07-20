#!/usr/bin/env node
// model-loader-registry-test.js — Model loader registry unit tests
//
// 验证 model-loader-registry 的诚实行为:
//   1. detectRuntime() — 当前环境无 runtime → { available: false, type: null, module: null }
//   2. loadModel() — 无 runtime → reject RUNTIME_NOT_AVAILABLE (async)
//   3. runSmokeInference() — 无 runtime → reject RUNTIME_NOT_AVAILABLE (async)
//   4. loadModel() — 无 runtime + 不存在的模型路径 → reject RUNTIME_NOT_AVAILABLE(不是 MODEL_FILE_NOT_FOUND)
//   5. validateProbabilities() — 校验概率分布合法性
//   6. mapOutputToScores / softmax / resolveInputDims — 输出映射工具
//
// 当前环境无 onnxruntime-node / @tensorflow/tfjs-node,因此 detectRuntime 必须返回
// available=false。这是诚实的 BLOCKED 状态:不冒充推理,不返回假分数。
// 将来安装 runtime 后,这些测试需要更新(detectRuntime 返回 available=true)。
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..', '..');
var registry = require(path.join(ROOT, 'src', 'safety', 'model-loader-registry'));
var ec = 0, pass = 0, fail = 0;
function t(n, ok, d) {
  console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

async function run() {
  // ── 1. detectRuntime — 当前环境无 runtime ──
  var rt = registry.detectRuntime();
  t('DETECT_RUNTIME_AVAILABLE_FALSE', rt.available === false, 'available=' + rt.available);
  t('DETECT_RUNTIME_TYPE_NULL', rt.type === null, 'type=' + rt.type);
  t('DETECT_RUNTIME_MODULE_NULL', rt.module === null, 'module=' + rt.module);
  t('DETECT_RUNTIME_VERSION_NULL', rt.version === null, 'version=' + rt.version);

  // ── 2. loadModel — 无 runtime → reject RUNTIME_NOT_AVAILABLE ──
  var loadErr = null;
  try { await registry.loadModel('/tmp/fake.onnx', rt); }
  catch (e) { loadErr = e; }
  t('LOAD_MODEL_NO_RUNTIME_THROWS', loadErr !== null, 'should reject');
  t('LOAD_MODEL_NO_RUNTIME_ERROR_CODE', loadErr && loadErr.message === 'RUNTIME_NOT_AVAILABLE',
    loadErr ? loadErr.message : 'no error');

  // ── 3. loadModel — 无 runtime + null runtimeInfo → reject RUNTIME_NOT_AVAILABLE ──
  var loadErr2 = null;
  try { await registry.loadModel('/tmp/fake.onnx', null); }
  catch (e) { loadErr2 = e; }
  t('LOAD_MODEL_NULL_RUNTIME_THROWS', loadErr2 && loadErr2.message === 'RUNTIME_NOT_AVAILABLE', '');

  // ── 4. loadModel — 无 runtime + 不存在的模型路径 → reject RUNTIME_NOT_AVAILABLE ──
  //    无 runtime 时,先检查 runtime 再检查文件(不会到达 MODEL_FILE_NOT_FOUND)
  var loadErr3 = null;
  try { await registry.loadModel('/definitely/not/exist/model.onnx', rt); }
  catch (e) { loadErr3 = e; }
  t('LOAD_MODEL_NO_RUNTIME_PRIORITY', loadErr3 && loadErr3.message === 'RUNTIME_NOT_AVAILABLE',
    loadErr3 ? loadErr3.message : 'no error');

  // ── 5. runSmokeInference — 无 runtime → reject RUNTIME_NOT_AVAILABLE ──
  var smokeErr = null;
  try { await registry.runSmokeInference({ model: {}, sha256: 'abc', type: 'onnx' }, rt); }
  catch (e) { smokeErr = e; }
  t('SMOKE_INFERENCE_NO_RUNTIME_THROWS', smokeErr !== null, 'should reject');
  t('SMOKE_INFERENCE_NO_RUNTIME_ERROR_CODE', smokeErr && smokeErr.message === 'RUNTIME_NOT_AVAILABLE',
    smokeErr ? smokeErr.message : 'no error');

  // ── 6. runSmokeInference — 无 runtime + null runtimeInfo → reject ──
  var smokeErr2 = null;
  try { await registry.runSmokeInference({ model: {} }, null); }
  catch (e) { smokeErr2 = e; }
  t('SMOKE_INFERENCE_NULL_RUNTIME_THROWS', smokeErr2 && smokeErr2.message === 'RUNTIME_NOT_AVAILABLE', '');

  // ── 7. runSmokeInference — 无 runtime + null loadedModel → reject RUNTIME_NOT_AVAILABLE ──
  //    (无 runtime 优先于无 model,先检查 runtime)
  var smokeErr3 = null;
  try { await registry.runSmokeInference(null, rt); }
  catch (e) { smokeErr3 = e; }
  t('SMOKE_INFERENCE_NULL_MODEL_THROWS', smokeErr3 && smokeErr3.message === 'RUNTIME_NOT_AVAILABLE',
    smokeErr3 ? smokeErr3.message : 'no error');

  // ── 7b. runSmokeInference — 有 runtime(模拟) + null loadedModel → reject MODEL_NOT_LOADED ──
  //    用一个伪造的 runtimeInfo(available=true)验证 MODEL_NOT_LOADED 路径
  var smokeErr4 = null;
  try { await registry.runSmokeInference(null, { available: true, type: 'onnx', module: {}, version: 'fake' }); }
  catch (e) { smokeErr4 = e; }
  t('SMOKE_INFERENCE_NULL_MODEL_WITH_RUNTIME_THROWS', smokeErr4 && smokeErr4.message === 'MODEL_NOT_LOADED',
    smokeErr4 ? smokeErr4.message : 'no error');

  // ── 7c. runRealInference — 无 runtime → reject RUNTIME_NOT_AVAILABLE ──
  var realErr = null;
  try { await registry.runRealInference({ model: {} }, rt, '/tmp/x.png'); }
  catch (e) { realErr = e; }
  t('RUN_REAL_INFERENCE_NO_RUNTIME_THROWS', realErr && realErr.message === 'RUNTIME_NOT_AVAILABLE', '');

  // ── 7d. runRealInference — 有 runtime(模拟) + null loadedModel → reject MODEL_NOT_LOADED ──
  var realErr2 = null;
  try { await registry.runRealInference(null, { available: true, type: 'onnx', module: {}, version: 'fake' }, '/tmp/x.png'); }
  catch (e) { realErr2 = e; }
  t('RUN_REAL_INFERENCE_NULL_MODEL_THROWS', realErr2 && realErr2.message === 'MODEL_NOT_LOADED', '');

  // ── 8. computeSha256 — 计算文件 SHA256(用于 modelSha256 / modelVersion)──
  var tmpFile = path.join(os.tmpdir(), 'registry-test-' + Date.now() + '-' + process.pid + '.bin');
  fs.writeFileSync(tmpFile, 'TEST_CONTENT_FOR_SHA256');
  try {
    var sha = registry.computeSha256(tmpFile);
    t('COMPUTE_SHA256_IS_STRING', typeof sha === 'string' && sha.length === 64, 'len=' + (sha && sha.length));
    t('COMPUTE_SHA256_DETERMINISTIC', sha === registry.computeSha256(tmpFile), 'same content → same hash');
    // SHA256('TEST_CONTENT_FOR_SHA256') 的预期值(在线计算)
    var crypto = require('crypto');
    var expected = crypto.createHash('sha256').update('TEST_CONTENT_FOR_SHA256').digest('hex');
    t('COMPUTE_SHA256_MATCHES_CRYPTO', sha === expected, '');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }

  // ── 9. validateProbabilities — 校验概率分布合法性 ──
  t('VALIDATE_PROBS_VALID_3', registry.validateProbabilities([0.5, 0.3, 0.2]) === true, 'sum=1.0');
  t('VALIDATE_PROBS_VALID_4', registry.validateProbabilities([0.97, 0.01, 0.01, 0.01]) === true, 'sum=1.0');
  t('VALIDATE_PROBS_VALID_2', registry.validateProbabilities([1.0, 0.0]) === true, 'sum=1.0');
  t('VALIDATE_PROBS_INVALID_SUM', registry.validateProbabilities([0.5, 0.6]) === false, 'sum=1.1');
  t('VALIDATE_PROBS_INVALID_NEG', registry.validateProbabilities([-0.1, 1.1]) === false, 'negative');
  t('VALIDATE_PROBS_INVALID_GT1', registry.validateProbabilities([0.5, 0.6, -0.1]) === false, '>1 and <0');
  t('VALIDATE_PROBS_INVALID_NULL', registry.validateProbabilities(null) === false, 'null');
  t('VALIDATE_PROBS_INVALID_EMPTY', registry.validateProbabilities([]) === false, 'empty array (sum=0)');
  // NaN/Infinity 输入 → invalid
  t('VALIDATE_PROBS_INVALID_NAN', registry.validateProbabilities([NaN, 1.0]) === false, 'NaN');
  t('VALIDATE_PROBS_INVALID_INF', registry.validateProbabilities([Infinity, 0.0]) === false, 'Infinity');

  // ── 9b. validateScores — 校验 scores 对象(无 NaN/Inf,4 字段,值在 [0,1])──
  t('VALIDATE_SCORES_VALID', registry.validateScores({ safe: 0.9, adult: 0.05, racy: 0.03, violence: 0.02 }) === true, '');
  t('VALIDATE_SCORES_VALID_ZEROS', registry.validateScores({ safe: 0, adult: 0, racy: 0, violence: 0 }) === true, '');
  t('VALIDATE_SCORES_INVALID_NAN', registry.validateScores({ safe: NaN, adult: 0, racy: 0, violence: 0 }) === false, 'NaN');
  t('VALIDATE_SCORES_INVALID_INF', registry.validateScores({ safe: Infinity, adult: 0, racy: 0, violence: 0 }) === false, 'Infinity');
  t('VALIDATE_SCORES_INVALID_GT1', registry.validateScores({ safe: 1.5, adult: 0, racy: 0, violence: 0 }) === false, '>1');
  t('VALIDATE_SCORES_INVALID_NEG', registry.validateScores({ safe: -0.1, adult: 0, racy: 0, violence: 0 }) === false, 'negative');
  t('VALIDATE_SCORES_INVALID_MISSING', registry.validateScores({ safe: 0.5, adult: 0.5 }) === false, 'missing fields');
  t('VALIDATE_SCORES_INVALID_NULL', registry.validateScores(null) === false, 'null');

  // ── 9c. softmax — 归一化 logits ──
  var sm = registry.softmax([1.0, 2.0, 3.0]);
  t('SOFTMAX_VALID_LENGTH', Array.isArray(sm) && sm.length === 3, '');
  t('SOFTMAX_VALID_SUM', Math.abs(sm[0] + sm[1] + sm[2] - 1) < 0.001, 'sum=' + (sm[0] + sm[1] + sm[2]));
  t('SOFTMAX_VALID_RANGE', sm.every(function (v) { return v >= 0 && v <= 1; }), '');
  t('SOFTMAX_NAN_INPUT', registry.softmax([NaN, 1.0]).length === 0, 'NaN → empty');
  t('SOFTMAX_INF_INPUT', registry.softmax([Infinity, 1.0]).length === 0, 'Infinity → empty');
  t('SOFTMAX_EMPTY', registry.softmax([]).length === 0, 'empty → empty');

  // ── 9d. mapOutputToScores — 输出映射 ──
  var s2 = registry.mapOutputToScores([0.8, 0.2]);
  t('MAP_OUTPUT_2_CLASS_SAFE', s2.safe === 0.8, 'safe=' + s2.safe);
  t('MAP_OUTPUT_2_CLASS_ADULT', s2.adult === 0.2, 'adult=' + s2.adult);
  t('MAP_OUTPUT_2_CLASS_RACY', s2.racy === 0, 'racy=' + s2.racy);
  t('MAP_OUTPUT_2_CLASS_VIOLENCE', s2.violence === 0, 'violence=' + s2.violence);

  var s1 = registry.mapOutputToScores([0.3]);
  t('MAP_OUTPUT_1_CLASS_SAFE', Math.abs(s1.safe - 0.7) < 0.001, 'safe=' + s1.safe);
  t('MAP_OUTPUT_1_CLASS_ADULT', Math.abs(s1.adult - 0.3) < 0.001, 'adult=' + s1.adult);

  var s4 = registry.mapOutputToScores([0.7, 0.1, 0.15, 0.05]);
  t('MAP_OUTPUT_4_CLASS_SAFE', s4.safe === 0.7, '');
  t('MAP_OUTPUT_4_CLASS_ADULT', s4.adult === 0.1, '');
  t('MAP_OUTPUT_4_CLASS_RACY', s4.racy === 0.15, '');
  t('MAP_OUTPUT_4_CLASS_VIOLENCE', s4.violence === 0.05, '');

  // NaN 输入 → 全 0(由 validateScores 拒绝)
  var sNaN = registry.mapOutputToScores([NaN, 0.5]);
  t('MAP_OUTPUT_NAN_ALL_ZEROS', sNaN.safe === 0 && sNaN.adult === 0, 'NaN → zeros');
  var sInf = registry.mapOutputToScores([Infinity, 0.5]);
  t('MAP_OUTPUT_INF_ALL_ZEROS', sInf.safe === 0 && sInf.adult === 0, 'Infinity → zeros');
  var sEmpty = registry.mapOutputToScores([]);
  t('MAP_OUTPUT_EMPTY_ALL_ZEROS', sEmpty.safe === 0 && sEmpty.adult === 0, 'empty → zeros');

  // ── 9e. resolveInputDims — 输入尺寸推导 ──
  var d1 = registry.resolveInputDims([1, 224, 224, 3]);
  t('RESOLVE_DIMS_NHWC_HEIGHT', d1.height === 224, 'height=' + d1.height);
  t('RESOLVE_DIMS_NHWC_WIDTH', d1.width === 224, 'width=' + d1.width);
  t('RESOLVE_DIMS_NHWC_CHANNELS', d1.channels === 3, 'channels=' + d1.channels);
  t('RESOLVE_DIMS_NHWC_LAYOUT', d1.layout === 'NHWC', 'layout=' + d1.layout);

  var d2 = registry.resolveInputDims([1, 3, 224, 224]);
  t('RESOLVE_DIMS_NCHW_HEIGHT', d2.height === 224, '');
  t('RESOLVE_DIMS_NCHW_WIDTH', d2.width === 224, '');
  t('RESOLVE_DIMS_NCHW_CHANNELS', d2.channels === 3, '');
  t('RESOLVE_DIMS_NCHW_LAYOUT', d2.layout === 'NCHW', '');

  // 动态维度(null)→ 默认值
  var d3 = registry.resolveInputDims([1, null, null, 3]);
  t('RESOLVE_DIMS_DYNAMIC_DEFAULT', d3.height === registry.DEFAULT_INPUT_SIZE && d3.width === registry.DEFAULT_INPUT_SIZE, '');

  var d4 = registry.resolveInputDims(null);
  t('RESOLVE_DIMS_NULL_DEFAULT', d4.height === registry.DEFAULT_INPUT_SIZE, '');

  // ── 10. BLOCKED 状态端到端验证:port 使用 registry 的真实输出 ──
  //    port.runtimeAvailable 必须与 registry.detectRuntime().available 一致
  var { createSafetyClassifierPort } = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port'));
  var port = createSafetyClassifierPort({ logger: {} });
  t('PORT_RUNTIME_MATCHES_REGISTRY', port.runtimeAvailable === rt.available,
    'port.runtimeAvailable=' + port.runtimeAvailable + ' registry.available=' + rt.available);
  t('PORT_RUNTIME_FALSE_IN_BLOCKED', port.runtimeAvailable === false, 'BLOCKED state: runtimeAvailable=false');
  t('PORT_READY_FALSE_IN_BLOCKED', port.ready === false, 'BLOCKED state: ready=false');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); process.exit(1); });
