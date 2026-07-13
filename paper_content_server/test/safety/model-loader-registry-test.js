#!/usr/bin/env node
// model-loader-registry-test.js — Model loader registry unit tests
//
// 验证 model-loader-registry 的诚实行为:
//   1. detectRuntime() — 当前环境无 runtime → { available: false, type: null, module: null }
//   2. loadModel() — 无 runtime → throw RUNTIME_NOT_AVAILABLE
//   3. runSmokeInference() — 无 runtime → throw RUNTIME_NOT_AVAILABLE
//   4. loadModel() — 无 runtime + 不存在的模型路径 → throw RUNTIME_NOT_AVAILABLE(不是 MODEL_FILE_NOT_FOUND)
//   5. validateProbabilities() — 校验概率分布合法性
//
// 当前环境无 onnxruntime-node / @tensorflow/tfjs-node,因此 detectRuntime 必须返回
// available=false。这是诚实的 BLOCKED 状态:不冒充推理,不返回假分数。
// 将来安装 runtime 后,这些测试需要更新(detectRuntime 返回 available=true)。
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var registry = require(path.join(ROOT, 'src', 'safety', 'model-loader-registry'));
var ec = 0, pass = 0, fail = 0;
function t(n, ok, d) {
  console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

function run() {
  // ── 1. detectRuntime — 当前环境无 runtime ──
  var rt = registry.detectRuntime();
  t('DETECT_RUNTIME_AVAILABLE_FALSE', rt.available === false, 'available=' + rt.available);
  t('DETECT_RUNTIME_TYPE_NULL', rt.type === null, 'type=' + rt.type);
  t('DETECT_RUNTIME_MODULE_NULL', rt.module === null, 'module=' + rt.module);
  t('DETECT_RUNTIME_VERSION_NULL', rt.version === null, 'version=' + rt.version);

  // ── 2. loadModel — 无 runtime → throw RUNTIME_NOT_AVAILABLE ──
  var loadErr = null;
  try { registry.loadModel('/tmp/fake.onnx', rt); }
  catch (e) { loadErr = e; }
  t('LOAD_MODEL_NO_RUNTIME_THROWS', loadErr !== null, 'should throw');
  t('LOAD_MODEL_NO_RUNTIME_ERROR_CODE', loadErr && loadErr.message === 'RUNTIME_NOT_AVAILABLE',
    loadErr ? loadErr.message : 'no error');

  // ── 3. loadModel — 无 runtime + null runtimeInfo → throw RUNTIME_NOT_AVAILABLE ──
  var loadErr2 = null;
  try { registry.loadModel('/tmp/fake.onnx', null); }
  catch (e) { loadErr2 = e; }
  t('LOAD_MODEL_NULL_RUNTIME_THROWS', loadErr2 && loadErr2.message === 'RUNTIME_NOT_AVAILABLE', '');

  // ── 4. loadModel — 无 runtime + 不存在的模型路径 → throw RUNTIME_NOT_AVAILABLE ──
  //    无 runtime 时,先检查 runtime 再检查文件(不会到达 MODEL_FILE_NOT_FOUND)
  var loadErr3 = null;
  try { registry.loadModel('/definitely/not/exist/model.onnx', rt); }
  catch (e) { loadErr3 = e; }
  t('LOAD_MODEL_NO_RUNTIME_PRIORITY', loadErr3 && loadErr3.message === 'RUNTIME_NOT_AVAILABLE',
    loadErr3 ? loadErr3.message : 'no error');

  // ── 5. runSmokeInference — 无 runtime → throw RUNTIME_NOT_AVAILABLE ──
  var smokeErr = null;
  try { registry.runSmokeInference({ model: {}, sha256: 'abc', type: 'onnx' }, rt); }
  catch (e) { smokeErr = e; }
  t('SMOKE_INFERENCE_NO_RUNTIME_THROWS', smokeErr !== null, 'should throw');
  t('SMOKE_INFERENCE_NO_RUNTIME_ERROR_CODE', smokeErr && smokeErr.message === 'RUNTIME_NOT_AVAILABLE',
    smokeErr ? smokeErr.message : 'no error');

  // ── 6. runSmokeInference — 无 runtime + null runtimeInfo → throw ──
  var smokeErr2 = null;
  try { registry.runSmokeInference({ model: {} }, null); }
  catch (e) { smokeErr2 = e; }
  t('SMOKE_INFERENCE_NULL_RUNTIME_THROWS', smokeErr2 && smokeErr2.message === 'RUNTIME_NOT_AVAILABLE', '');

  // ── 7. runSmokeInference — 无 runtime + null loadedModel → throw ──
  var smokeErr3 = null;
  try { registry.runSmokeInference(null, rt); }
  catch (e) { smokeErr3 = e; }
  t('SMOKE_INFERENCE_NULL_MODEL_THROWS', smokeErr3 && smokeErr3.message === 'RUNTIME_NOT_AVAILABLE',
    smokeErr3 ? smokeErr3.message : 'no error');

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
run();
