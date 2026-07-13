#!/usr/bin/env node
// nsfw-safety-gate-test.js — NSFW safety gate (兼容层) 单元测试
// 新版本:isSafe 接受 classification 对象(不是 filePath),classify 委托给 SafetyClassifierPort
// 默认未配置模型 → fail-closed
var path = require('path');
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
  // 1. 默认无模型 → isSafe 永远 false (fail-closed)
  t('NO_MODEL_SAFE_FALSE_LOW', gate.isSafe({ score: 0.0 }) === false, 'score=0 should be unsafe when no model');
  t('NO_MODEL_SAFE_FALSE_HIGH', gate.isSafe({ score: 0.9 }) === false, '');
  // 2. 无 classification → false
  t('NULL_CLASSIFICATION_FALSE', gate.isSafe(null) === false, '');
  t('UNDEFINED_CLASSIFICATION_FALSE', gate.isSafe(undefined) === false, '');
  // 3. 无 score → false
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

  // ── 用 modelPath 注入(但仍 fail-closed,因为无真实推理引擎)──
  var gate3 = createNsfwSafetyGate({ logger: logger, modelPath: '/tmp/model.onnx' });
  t('WITH_MODELPATH_CONFIGURED_TRUE', gate3.configured === true, '');
  t('WITH_MODELPATH_MODEL_VERSION_STUB', gate3.modelVersion === 'STUB_1.0', '');
  var c9 = await gate3.classify('/tmp/q.bin', { originalName: 'ok.png', fileSize: 100, width: 100, height: 100 });
  t('WITH_MODELPATH_CLASSIFY_FAILCLOSED', c9 && c9.score === undefined, 'port 未实现 → 无 score');
  // isSafe 对有 score 的 classification 仍判断(threshold)
  t('WITH_MODELPATH_IS_SAFE_LOW', gate3.isSafe({ score: 0.1 }) === true, '');
  t('WITH_MODELPATH_IS_SAFE_HIGH', gate3.isSafe({ score: 0.9 }) === false, '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); process.exit(1); });
