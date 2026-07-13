#!/usr/bin/env node
// safety-classifier-port-test.js — SafetyClassifierPort 单元测试
// 7 级 readiness truth: configured / modelExists / runtimeAvailable / loaded /
//   smokeInferencePassed / inferenceReady / ready。
//   configured         = !!modelPath (path provided)
//   modelExists        = !!modelPath && fs.existsSync(modelPath)
//   runtimeAvailable   = 推理 runtime (onnxruntime/tfjs-node) 已安装
//   loaded             = false (当前无 runtime,不冒充)
//   smokeInferencePassed = false (当前无 runtime,不冒充)
//   inferenceReady     = loaded && smokeInferencePassed = false
//   ready              = inferenceReady = false (当前始终 false,即使文件存在)
//
// classify 行为(fail-closed,不返回假数据):
//   无 modelPath / 文件不存在 → reject(CLASSIFIER_NOT_READY)
//   文件存在但无 runtime → reject(NO_RUNTIME_AVAILABLE)
//   有 runtime 但未加载/smoke 失败 → reject(CLASSIFIER_NOT_READY)(当前不触发)
//
// isSafe 行为:
//   新结构:classification.decision === 'SAFE' → true
//   旧结构:classification.score < threshold → true
//   无 decision 且无 score → false (fail-closed)
//
// audit 写入 append-only JSONL(auditFile);无 auditFile 时 resolve。
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var { createSafetyClassifierPort } = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var warns = [];
var logger = { warn: function (m) { warns.push(m); }, info: function () {}, error: function () {} };

async function run() {
  // ── 无 modelPath ──
  var port = createSafetyClassifierPort({ logger: logger });

  // 1. 无 modelPath → classify rejects (CLASSIFIER_NOT_READY)
  var classifyErr = null;
  try { await port.classify('/tmp/x.png', { width: 10, height: 10 }); }
  catch (e) { classifyErr = e; }
  t('NO_MODEL_CLASSIFY_REJECTS', classifyErr !== null && classifyErr.message === 'CLASSIFIER_NOT_READY',
    classifyErr ? classifyErr.message : 'no error');

  // 2. isSafe:新结构 decision vs 旧结构 score
  t('NO_MODEL_IS_SAFE_DECISION_SAFE_TRUE', port.isSafe({ decision: 'SAFE' }) === true, 'decision=SAFE');
  t('NO_MODEL_IS_SAFE_DECISION_UNSAFE_FALSE', port.isSafe({ decision: 'UNSAFE' }) === false, 'decision=UNSAFE');
  t('NO_MODEL_IS_SAFE_DECISION_REVIEW_FALSE', port.isSafe({ decision: 'REVIEW' }) === false, 'decision=REVIEW');
  t('NO_MODEL_IS_SAFE_LOW_SCORE_TRUE', port.isSafe({ score: 0.0 }) === true, '0.0 < 0.5 threshold');
  t('NO_MODEL_IS_SAFE_HIGH_SCORE_FALSE', port.isSafe({ score: 0.9 }) === false, '0.9 >= 0.5 threshold');
  t('NO_MODEL_IS_SAFE_UNDEFINED_FALSE', port.isSafe(undefined) === false, 'undefined classification');
  t('NO_MODEL_IS_SAFE_NOSCORE_FALSE', port.isSafe({}) === false, 'no score/decision field');

  // 3. 无 modelPath → 7 级 truth 全部正确(configured=false, 其余 false)
  t('NO_MODEL_CONFIGURED_FALSE', port.configured === false, 'configured=' + port.configured);
  t('NO_MODEL_MODEL_EXISTS_FALSE', port.modelExists === false, 'modelExists=' + port.modelExists);
  t('NO_MODEL_RUNTIME_AVAILABLE_FALSE', port.runtimeAvailable === false, 'runtimeAvailable=' + port.runtimeAvailable);
  t('NO_MODEL_LOADED_FALSE', port.loaded === false, 'loaded=' + port.loaded);
  t('NO_MODEL_SMOKE_INFERENCE_FALSE', port.smokeInferencePassed === false, 'smokeInferencePassed=' + port.smokeInferencePassed);
  t('NO_MODEL_INFERENCE_READY_FALSE', port.inferenceReady === false, 'inferenceReady=' + port.inferenceReady);
  t('NO_MODEL_READY_FALSE', port.ready === false, 'ready=' + port.ready);

  // 4. 无 modelPath → modelVersion='NONE', modelSha256='', modelType=''
  t('NO_MODEL_MODEL_VERSION_NONE', port.modelVersion === 'NONE', 'modelVersion=' + port.modelVersion);
  t('NO_MODEL_MODEL_SHA256_EMPTY', port.modelSha256 === '', 'modelSha256=' + port.modelSha256);

  // 5. threshold 字段对外暴露
  t('NO_MODEL_THRESHOLD_EXPOSED', port.threshold === 0.5, 'threshold=' + port.threshold);

  // 6. 无 auditFile → audit resolves(不阻塞调用方)
  var auditOk = true;
  try { await port.audit({ assetId: 'a1', decision: 'SAFE' }); } catch (e) { auditOk = false; }
  t('NO_AUDITFILE_AUDIT_RESOLVES', auditOk, '');

  // ── modelPath 指向不存在的路径 ──
  // configured=true (path provided), but modelExists=false (file missing) → ready=false
  var portMissing = createSafetyClassifierPort({ logger: logger, modelPath: '/definitely/not/exist/model.onnx' });
  t('MISSING_MODELPATH_CONFIGURED_TRUE', portMissing.configured === true, 'configured=' + portMissing.configured);
  t('MISSING_MODELPATH_MODEL_EXISTS_FALSE', portMissing.modelExists === false, 'modelExists=' + portMissing.modelExists);
  t('MISSING_MODELPATH_RUNTIME_AVAILABLE_FALSE', portMissing.runtimeAvailable === false, '');
  t('MISSING_MODELPATH_LOADED_FALSE', portMissing.loaded === false, '');
  t('MISSING_MODELPATH_SMOKE_INFERENCE_FALSE', portMissing.smokeInferencePassed === false, '');
  t('MISSING_MODELPATH_INFERENCE_READY_FALSE', portMissing.inferenceReady === false, '');
  t('MISSING_MODELPATH_READY_FALSE', portMissing.ready === false, '');
  t('MISSING_MODELPATH_MODEL_VERSION_NONE', portMissing.modelVersion === 'NONE', '');
  var classifyErrMissing = null;
  try { await portMissing.classify('/tmp/x.png', {}); }
  catch (e) { classifyErrMissing = e; }
  t('MISSING_MODELPATH_CLASSIFY_REJECTS', classifyErrMissing !== null && classifyErrMissing.message === 'CLASSIFIER_NOT_READY',
    classifyErrMissing ? classifyErrMissing.message : 'no error');

  // ── modelPath 指向真实存在的文件(仍 fail-closed,因为无 runtime)──
  // configured=true AND modelExists=true, BUT runtimeAvailable=false
  // → loaded=false / smokeInferencePassed=false / inferenceReady=false / ready=false
  // 文件存在 ≠ ready;无 runtime 时 classify reject(NO_RUNTIME_AVAILABLE)。
  var tmpModel = path.join(os.tmpdir(), 'fake-model-' + Date.now() + '-' + process.pid + '.onnx');
  fs.writeFileSync(tmpModel, 'FAKE_MODEL_BYTES');
  try {
    var port2 = createSafetyClassifierPort({ logger: logger, modelPath: tmpModel });

    // 7. 有真实存在的 modelPath → configured=true, modelExists=true,
    //    但 runtimeAvailable=false / loaded=false / smokeInferencePassed=false / ready=false
    t('WITH_MODELPATH_CONFIGURED_TRUE', port2.configured === true, 'configured=' + port2.configured);
    t('WITH_MODELPATH_MODEL_EXISTS_TRUE', port2.modelExists === true, 'modelExists=' + port2.modelExists);
    t('WITH_MODELPATH_RUNTIME_AVAILABLE_FALSE', port2.runtimeAvailable === false, 'runtimeAvailable=' + port2.runtimeAvailable);
    t('WITH_MODELPATH_LOADED_FALSE', port2.loaded === false, 'loaded=' + port2.loaded);
    t('WITH_MODELPATH_SMOKE_INFERENCE_FALSE', port2.smokeInferencePassed === false, 'smokeInferencePassed=' + port2.smokeInferencePassed);
    t('WITH_MODELPATH_INFERENCE_READY_FALSE', port2.inferenceReady === false, 'inferenceReady=' + port2.inferenceReady);
    t('WITH_MODELPATH_READY_FALSE', port2.ready === false, 'ready=' + port2.ready);

    // 8. 有 modelPath 但无 runtime → classify rejects (NO_RUNTIME_AVAILABLE)
    var classifyErr2 = null;
    try { await port2.classify('/tmp/x.png', { width: 10, height: 10 }); }
    catch (e) { classifyErr2 = e; }
    t('WITH_MODELPATH_CLASSIFY_REJECTS', classifyErr2 !== null && classifyErr2.message === 'NO_RUNTIME_AVAILABLE',
      classifyErr2 ? classifyErr2.message : 'no error');

    // 9. isSafe 仍基于 decision(新)或 score(旧)vs threshold
    t('WITH_MODELPATH_IS_SAFE_DECISION_SAFE', port2.isSafe({ decision: 'SAFE' }) === true, '');
    t('WITH_MODELPATH_IS_SAFE_DECISION_UNSAFE', port2.isSafe({ decision: 'UNSAFE' }) === false, '');
    t('WITH_MODELPATH_IS_SAFE_LOW_SCORE', port2.isSafe({ score: 0.1 }) === true, '0.1 < 0.5');
    t('WITH_MODELPATH_IS_SAFE_HIGH_SCORE', port2.isSafe({ score: 0.9 }) === false, '0.9 >= 0.5');
    t('WITH_MODELPATH_IS_SAFE_UNDEFINED_SCORE', port2.isSafe({ score: undefined }) === false, '');

    // 10. 有 modelPath 但无 runtime → modelVersion='NONE'(未加载,无真实版本)
    t('WITH_MODELPATH_MODEL_VERSION_NONE', port2.modelVersion === 'NONE', 'modelVersion=' + port2.modelVersion);
    t('WITH_MODELPATH_MODEL_SHA256_EMPTY', port2.modelSha256 === '', 'modelSha256=' + port2.modelSha256);

    // 11. 自定义 threshold
    var port3 = createSafetyClassifierPort({ logger: logger, modelPath: tmpModel, threshold: 0.2 });
    t('CUSTOM_THRESHOLD_UNSAFE', port3.isSafe({ score: 0.3 }) === false, '0.3 >= 0.2 threshold → unsafe');
    t('CUSTOM_THRESHOLD_SAFE', port3.isSafe({ score: 0.1 }) === true, '0.1 < 0.2 threshold → safe');
    t('CUSTOM_THRESHOLD_FIELD_EXPOSED', port3.threshold === 0.2, 'threshold=' + port3.threshold);
  } finally {
    try { fs.unlinkSync(tmpModel); } catch (e) {}
  }

  // ── audit 写入 append-only JSONL ──
  var tmpAudit = path.join(os.tmpdir(), 'audit-' + Date.now() + '-' + process.pid + '.jsonl');
  try {
    var port4 = createSafetyClassifierPort({ logger: logger, auditFile: tmpAudit });
    await port4.audit({ assetId: 'a1', decision: 'SAFE', score: 0.1 });
    await port4.audit({ assetId: 'a2', decision: 'REJECTED', score: 0.9 });
    var lines = fs.readFileSync(tmpAudit, 'utf8').trim().split('\n');
    t('AUDIT_FILE_HAS_TWO_LINES', lines.length === 2, 'lines=' + lines.length);
    var e1 = JSON.parse(lines[0]);
    var e2 = JSON.parse(lines[1]);
    t('AUDIT_ENTRY_1_ASSET', e1.assetId === 'a1' && e1.decision === 'SAFE', '');
    t('AUDIT_ENTRY_2_ASSET', e2.assetId === 'a2' && e2.decision === 'REJECTED', '');
    // 每条记录单行(append-only,不重写已有内容)
    t('AUDIT_ENTRIES_ONE_LINE_EACH', lines[0].indexOf('\n') < 0 && lines[1].indexOf('\n') < 0, '');
    // 第三条追加后,文件应有 3 行(append-only,不覆盖)
    await port4.audit({ assetId: 'a3', decision: 'SAFE' });
    var lines3 = fs.readFileSync(tmpAudit, 'utf8').trim().split('\n');
    t('AUDIT_APPEND_ONLY_THREE_LINES', lines3.length === 3, 'lines=' + lines3.length);
  } finally {
    try { fs.unlinkSync(tmpAudit); } catch (e) {}
  }

  // ── audit 失败(auditFile 目录不存在)→ reject(不静默丢弃)──
  var port5 = createSafetyClassifierPort({ logger: logger, auditFile: '/definitely/not/exist/dir/audit.jsonl' });
  var auditErr = null;
  try { await port5.audit({ assetId: 'x', decision: 'SAFE' }); } catch (e) { auditErr = e; }
  t('AUDIT_FAIL_REJECTS', auditErr !== null, 'should reject when auditFile directory missing');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + e.message); process.exit(1); });
