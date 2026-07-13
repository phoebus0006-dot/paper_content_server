#!/usr/bin/env node
// safety-classifier-port-test.js — SafetyClassifierPort 单元测试
// 验证:无模型时 fail-closed;有 modelPath 但无推理引擎时也 fail-closed
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createSafetyClassifierPort } = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var warns = [];
var logger = { warn: function (m) { warns.push(m); }, info: function () {}, error: function () {} };

async function run() {
  // ── 无模型 ──
  var port = createSafetyClassifierPort({ logger: logger });

  // 1. 无模型 → classify rejects (NO_CLASSIFIER_MODEL_CONFIGURED)
  var classifyErr = null;
  try { await port.classify('/tmp/x.png', { width: 10, height: 10 }); }
  catch (e) { classifyErr = e; }
  t('NO_MODEL_CLASSIFY_REJECTS', classifyErr !== null && classifyErr.message === 'NO_CLASSIFIER_MODEL_CONFIGURED',
    classifyErr ? classifyErr.message : 'no error');

  // 2. 无模型 → isSafe returns false (fail-closed)
  t('NO_MODEL_IS_SAFE_FALSE', port.isSafe({ score: 0.0 }) === false, 'score=0 should still be unsafe when no model');
  t('NO_MODEL_IS_SAFE_FALSE_UNDEFINED', port.isSafe(undefined) === false, '');
  t('NO_MODEL_IS_SAFE_FALSE_NOSCORE', port.isSafe({}) === false, '');

  // 3. 无模型 → configured=false
  t('NO_MODEL_CONFIGURED_FALSE', port.configured === false, 'configured=' + port.configured);

  // 4. 无模型 → modelVersion='NONE'
  t('NO_MODEL_MODEL_VERSION_NONE', port.modelVersion === 'NONE', 'modelVersion=' + port.modelVersion);

  // 5. 无模型 → warn 被调用
  t('NO_MODEL_WARNS', warns.length > 0, '');

  // 6. 无模型 → audit resolves (永不失败)
  var auditOk = true;
  try { await port.audit({ assetId: 'a1', decision: 'SAFE' }); } catch (e) { auditOk = false; }
  t('NO_MODEL_AUDIT_RESOLVES', auditOk, '');

  // ── 有 modelPath 但无推理引擎 ──
  var port2 = createSafetyClassifierPort({ logger: logger, modelPath: '/tmp/model.onnx' });

  // 7. 有 modelPath → configured=true
  t('WITH_MODELPATH_CONFIGURED_TRUE', port2.configured === true, 'configured=' + port2.configured);

  // 8. 有 modelPath 但无推理引擎 → classify rejects (CLASSIFIER_NOT_IMPLEMENTED)
  var classifyErr2 = null;
  try { await port2.classify('/tmp/x.png', { width: 10, height: 10 }); }
  catch (e) { classifyErr2 = e; }
  t('WITH_MODELPATH_CLASSIFY_REJECTS', classifyErr2 !== null && classifyErr2.message === 'CLASSIFIER_NOT_IMPLEMENTED',
    classifyErr2 ? classifyErr2.message : 'no error');

  // 9. 有 modelPath 但无推理引擎 → isSafe 仍基于 score 判断(但 classify 已 reject)
  //    验证 isSafe 逻辑:score < threshold(默认 0.5)→ true
  t('WITH_MODELPATH_IS_SAFE_LOW_SCORE', port2.isSafe({ score: 0.1 }) === true, '');
  t('WITH_MODELPATH_IS_SAFE_HIGH_SCORE', port2.isSafe({ score: 0.9 }) === false, '');
  t('WITH_MODELPATH_IS_SAFE_UNDEFINED_SCORE', port2.isSafe({ score: undefined }) === false, '');

  // 10. 有 modelPath → modelVersion='STUB_1.0'
  t('WITH_MODELPATH_MODEL_VERSION_STUB', port2.modelVersion === 'STUB_1.0', 'modelVersion=' + port2.modelVersion);

  // 11. 自定义 threshold
  var port3 = createSafetyClassifierPort({ logger: logger, modelPath: '/tmp/m.onnx', threshold: 0.2 });
  t('CUSTOM_THRESHOLD', port3.isSafe({ score: 0.3 }) === false, '0.3 >= 0.2 threshold → unsafe');
  t('CUSTOM_THRESHOLD_SAFE', port3.isSafe({ score: 0.1 }) === true, '0.1 < 0.2 threshold → safe');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + e.message); process.exit(1); });
