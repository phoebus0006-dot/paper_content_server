#!/usr/bin/env node
// nsfw-safety-gate-test.js — NSFW safety gate (兼容层) 单元测试
// isSafe 接受 classification 对象(不是 filePath),classify 委托给 SafetyClassifierPort。
// 默认未配置模型 → fail-closed:port.classify reject,gate 返回 score=undefined 的分类。
// 注:isSafe 现基于 score vs threshold(fail-closed 由 classify reject 保证);
//     因此 gate.isSafe({score:0.0}) 在无模型时仍返回 true(0<0.5),
//     但实际流程中 classify 拒绝 → 上层拿到 score=undefined → isSafe 返回 false。
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var { createNsfwSafetyGate } = require(path.join(ROOT, 'src', 'safety', 'nsfw-safety-gate'));
var { createSafetyClassifierPort } = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var warns = [];
var logger = { info: function () {}, warn: function (m) { warns.push(m); }, error: function () {} };

async function run() {
  var gate = createNsfwSafetyGate({ logger: logger });

  // ── isSafe(接受 classification 对象)──
  // 1. isSafe 基于 score vs threshold(fail-closed 由 classify reject 保证:无模型时
  //    classify 返回 score=undefined 的分类 → 上层 isSafe 返回 false)。
  //    直接调用 isSafe({score:0.0}) 仍按 threshold 判断 → true(0 < 0.5)。
  t('NO_MODEL_SAFE_LOW_SCORE_TRUE', gate.isSafe({ score: 0.0 }) === true, '0.0 < 0.5 threshold');
  t('NO_MODEL_SAFE_HIGH_SCORE_FALSE', gate.isSafe({ score: 0.9 }) === false, '0.9 >= 0.5 threshold');
  // 2. 无 classification → false
  t('NULL_CLASSIFICATION_FALSE', gate.isSafe(null) === false, '');
  t('UNDEFINED_CLASSIFICATION_FALSE', gate.isSafe(undefined) === false, '');
  // 3. 无 score → false(fail-closed:无 score 一律不安全)
  t('NO_SCORE_FALSE', gate.isSafe({}) === false, '');
  t('UNDEFINED_SCORE_FALSE', gate.isSafe({ score: undefined }) === false, '');

  // ── classify(委托给 port,默认无模型 → fail-closed 无 score)──
  // 4. 正常文件名 + 无模型 → classify 返回无 score 分类
  var c1 = await gate.classify('/tmp/q_abc.bin', { originalName: 'ok.png', fileSize: 100, width: 100, height: 100 });
  t('CLASSIFY_NO_MODEL_NO_SCORE', c1 && c1.score === undefined, 'score=' + (c1 && c1.score));
  t('CLASSIFY_NO_MODEL_UNAVAILABLE', c1 && c1.category === 'UNAVAILABLE', 'category=' + (c1 && c1.category));
  t('CLASSIFY_NO_MODEL_MODEL_VERSION_NONE', c1 && c1.modelVersion === 'NONE', '');

  // 5. 文件名含 nsfw 关键词 → 启发式拒绝(score=1.0)
  warns = [];
  var c2 = await gate.classify('/tmp/q_abc.bin', { originalName: 'nsfw_image.png', fileSize: 100, width: 100, height: 100 });
  t('HEURISTIC_NSFW_KEYWORD_REJECT', c2 && c2.score === 1.0, 'score=' + (c2 && c2.score));
  t('HEURISTIC_NSFW_KEYWORD_CATEGORY', c2 && c2.category === 'HEURISTIC_REJECT', '');
  t('HEURISTIC_NSFW_KEYWORD_REASON', c2 && c2.reason === 'BLOCKED_KEYWORD', '');

  // 6. 文件名含 explicit → 拒绝
  var c3 = await gate.classify('/tmp/q.bin', { originalName: 'explicit_pic.png', fileSize: 100, width: 100, height: 100 });
  t('HEURISTIC_EXPLICIT_REJECT', c3 && c3.score === 1.0 && c3.reason === 'BLOCKED_KEYWORD', '');

  // 7. 超大文件 → 启发式拒绝
  var c4 = await gate.classify('/tmp/q.bin', { originalName: 'big.png', fileSize: 60 * 1024 * 1024, width: 100, height: 100 });
  t('HEURISTIC_OVERSIZED_FILE_REJECT', c4 && c4.score === 1.0 && c4.reason === 'OVERSIZED_FILE', '');

  // 8. 超大宽度 → 启发式拒绝
  var c5 = await gate.classify('/tmp/q.bin', { originalName: 'wide.png', fileSize: 100, width: 9000, height: 100 });
  t('HEURISTIC_OVERSIZED_WIDTH_REJECT', c5 && c5.score === 1.0 && c5.reason === 'OVERSIZED_WIDTH', '');

  // 9. 超大高度 → 启发式拒绝
  var c6 = await gate.classify('/tmp/q.bin', { originalName: 'tall.png', fileSize: 100, width: 100, height: 10000 });
  t('HEURISTIC_OVERSIZED_HEIGHT_REJECT', c6 && c6.score === 1.0 && c6.reason === 'OVERSIZED_HEIGHT', '');

  // 10. warn 日志在启发式拒绝时被调用
  t('WARN_LOGGED_ON_HEURISTIC', warns.length > 0, '');

  // ── configured / modelVersion / ALLOWED_EXT 暴露 ──
  t('CONFIGURED_FALSE_DEFAULT', gate.configured === false, 'configured=' + gate.configured);
  t('MODEL_VERSION_NONE_DEFAULT', gate.modelVersion === 'NONE', '');
  t('ALLOWED_EXT_EXPOSED', Array.isArray(gate.ALLOWED_EXT) && gate.ALLOWED_EXT.length === 4, '');

  // ── audit(委托给 port,默认 resolves)──
  var auditOk = true;
  try { await gate.audit({ assetId: 'a1', decision: 'SAFE' }); } catch (e) { auditOk = false; }
  t('AUDIT_RESOLVES', auditOk, '');

  // ── 注入自定义 classifierPort(模拟真实 classifier)──
  var customPort = {
    classify: function () { return Promise.resolve({ score: 0.2, category: 'SAFE', modelVersion: 'CUSTOM_1.0', scores: { safe: 0.8 } }); },
    isSafe: function (c) { return c && c.score < 0.5; },
    audit: function () { return Promise.resolve(); },
    configured: true,
    modelVersion: 'CUSTOM_1.0',
  };
  var gate2 = createNsfwSafetyGate({ logger: logger, classifierPort: customPort });
  var c7 = await gate2.classify('/tmp/q.bin', { originalName: 'ok.png', fileSize: 100, width: 100, height: 100 });
  t('CUSTOM_PORT_CLASSIFY_DELEGATES', c7 && c7.score === 0.2 && c7.modelVersion === 'CUSTOM_1.0', '');
  t('CUSTOM_PORT_IS_SAFE_TRUE', gate2.isSafe({ score: 0.2 }) === true, '');
  t('CUSTOM_PORT_CONFIGURED_TRUE', gate2.configured === true, '');
  // 即使有自定义 port,启发式拒绝仍然优先
  var c8 = await gate2.classify('/tmp/q.bin', { originalName: 'nsfw.png', fileSize: 100, width: 100, height: 100 });
  t('CUSTOM_PORT_HEURISTIC_STILL_REJECTS', c8 && c8.score === 1.0 && c8.category === 'HEURISTIC_REJECT', '');

  // ── 用 modelPath 注入(指向真实存在的文件,但 port 仍未实现推理)──
  //    新 port:configured = !!modelPath && fs.existsSync(modelPath),因此必须用真实文件。
  var tmpModel = path.join(os.tmpdir(), 'nsfw-gate-fake-model-' + Date.now() + '-' + process.pid + '.onnx');
  fs.writeFileSync(tmpModel, 'FAKE_MODEL_BYTES');
  try {
    var gate3 = createNsfwSafetyGate({ logger: logger, modelPath: tmpModel });
    t('WITH_MODELPATH_CONFIGURED_TRUE', gate3.configured === true, 'configured=' + gate3.configured);
    t('WITH_MODELPATH_MODEL_VERSION_STUB', gate3.modelVersion === 'STUB_1.0', 'modelVersion=' + gate3.modelVersion);
    var c9 = await gate3.classify('/tmp/q.bin', { originalName: 'ok.png', fileSize: 100, width: 100, height: 100 });
    t('WITH_MODELPATH_CLASSIFY_FAILCLOSED', c9 && c9.score === undefined, 'port 未实现 → 无 score');
    // isSafe 对有 score 的 classification 仍判断(threshold)
    t('WITH_MODELPATH_IS_SAFE_LOW', gate3.isSafe({ score: 0.1 }) === true, '');
    t('WITH_MODELPATH_IS_SAFE_HIGH', gate3.isSafe({ score: 0.9 }) === false, '');
  } finally {
    try { fs.unlinkSync(tmpModel); } catch (e) {}
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); process.exit(1); });
