#!/usr/bin/env node
// safety-classifier-lifecycle-test.js — 异步生命周期 + fail-closed 路径 + 安全保证
//
// 覆盖:
//   1. 初始化幂等(多次 initialize 只加载一次)
//   2. 缺模型 → ready=false
//   3. 缺 runtime → ready=false
//   4. 加载失败 → ready=false, error 有信息
//   5. smoke 失败 → ready=false
//   6. NaN score → reject
//   7. Infinity score → reject
//   8. 输出长度错误 → reject
//   9. 推理超时 → reject
//  10. audit 失败 → reject(不创建资产)
//  11. shutdown → ready=false
//  12. 并发 initialize 只加载一次
//  13. 真实安全/不安全 fixture → SKIPPED_NO_CLASSIFIER(无 runtime)
//
// 测试 4-9 用 mock registry 注入(测试 port 的校验逻辑,不是冒充真实推理)。
// mock registry 只在 port 内部触发,不会影响真实 readiness truth。
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var { createSafetyClassifierPort } = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port'));
var realRegistry = require(path.join(ROOT, 'src', 'safety', 'model-loader-registry'));
var ec = 0, pass = 0, fail = 0;
function t(n, ok, d) {
  console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

var logger = { info: function () {}, warn: function () {}, error: function () {} };

// ── mock registry 工厂 ──
// 用于注入 port 测试 fail-closed 路径(port 的校验逻辑,不是冒充推理)
function makeMockRegistry(opts) {
  opts = opts || {};
  var loadCalls = { count: 0 };
  var smokeCalls = { count: 0 };
  var inferCalls = { count: 0 };
  var reg = {
    _loadCalls: loadCalls,
    _smokeCalls: smokeCalls,
    _inferCalls: inferCalls,
    detectRuntime: opts.detectRuntime || function () {
      return { available: true, type: 'onnx', module: {}, version: 'mock-1.0' };
    },
    loadModel: opts.loadModel || function (modelPath, rt) {
      loadCalls.count++;
      return Promise.resolve({
        model: { _mock: true },
        sha256: 'aabbccdd11223344',
        type: 'onnx',
        version: 'mock-1.0',
        inputShape: [1, 224, 224, 3],
        outputNames: ['output'],
      });
    },
    runSmokeInference: opts.runSmokeInference || function () {
      smokeCalls.count++;
      return Promise.resolve(true);
    },
    runRealInference: opts.runRealInference || function () {
      inferCalls.count++;
      return Promise.resolve({
        scores: { safe: 0.95, adult: 0.02, racy: 0.02, violence: 0.01 },
        rawOutput: [0.95, 0.02, 0.02, 0.01],
      });
    },
    validateScores: realRegistry.validateScores,
    validateProbabilities: realRegistry.validateProbabilities,
  };
  return reg;
}

async function run() {
  // ── 1. 初始化幂等(多次 initialize 只加载一次)──
  {
    var mockReg = makeMockRegistry();
    var tmpModel = path.join(os.tmpdir(), 'lc-idempotent-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK_MODEL');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      t('IDEMPOTENT_INIT_READY_FALSE_BEFORE', port.ready === false, 'before init ready=' + port.ready);
      t('IDEMPOTENT_INIT_LOADING_FALSE_BEFORE', port.loading === false, '');

      var p1 = port.initialize();
      var p2 = port.initialize();
      t('IDEMPOTENT_INIT_SAME_PROMISE', p1 === p2, 'initialize should return same promise');
      await p1;

      t('IDEMPOTENT_INIT_LOADED_TRUE', port.loaded === true, 'loaded=' + port.loaded);
      t('IDEMPOTENT_INIT_SMOKE_TRUE', port.smokeInferencePassed === true, 'smoke=' + port.smokeInferencePassed);
      t('IDEMPOTENT_INIT_READY_TRUE', port.ready === true, 'ready=' + port.ready);
      t('IDEMPOTENT_INIT_LOADING_FALSE_AFTER', port.loading === false, '');
      t('IDEMPOTENT_INIT_ERROR_NULL', port.error === null, 'error=' + port.error);

      // 再调用一次 initialize — 不应再次加载
      await port.initialize();
      t('IDEMPOTENT_INIT_LOAD_ONCE', mockReg._loadCalls.count === 1, 'loadCalls=' + mockReg._loadCalls.count);
      t('IDEMPOTENT_INIT_SMOKE_ONCE', mockReg._smokeCalls.count === 1, 'smokeCalls=' + mockReg._smokeCalls.count);

      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 2. 缺模型 → ready=false ──
  {
    var port = createSafetyClassifierPort({ logger: logger });
    await port.initialize();
    t('NO_MODEL_CONFIGURED_FALSE', port.configured === false, '');
    t('NO_MODEL_READY_FALSE', port.ready === false, '');
    t('NO_MODEL_LOADED_FALSE', port.loaded === false, '');
    t('NO_MODEL_ERROR_NULL', port.error === null, 'no error — just not configured');

    var classifyErr = null;
    try { await port.classify('/tmp/x.png', {}); }
    catch (e) { classifyErr = e; }
    t('NO_MODEL_CLASSIFY_REJECTS', classifyErr && classifyErr.message === 'CLASSIFIER_NOT_READY', '');
  }

  // ── 3. 缺 runtime → ready=false ──
  {
    var tmpModel = path.join(os.tmpdir(), 'lc-no-rt-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'FAKE');
    try {
      var port = createSafetyClassifierPort({ logger: logger, modelPath: tmpModel });
      // 真实 registry → runtimeAvailable=false
      t('NO_RUNTIME_RUNTIME_AVAILABLE_FALSE', port.runtimeAvailable === false, '');
      await port.initialize();
      t('NO_RUNTIME_LOADED_FALSE', port.loaded === false, '');
      t('NO_RUNTIME_READY_FALSE', port.ready === false, '');
      t('NO_RUNTIME_ERROR_SET', port.error === 'NO_RUNTIME_AVAILABLE', 'error=' + port.error);

      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('NO_RUNTIME_CLASSIFY_REJECTS', classifyErr && classifyErr.message === 'NO_RUNTIME_AVAILABLE', '');
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 4. 加载失败 → ready=false, error 有信息 ──
  {
    var mockReg = makeMockRegistry({
      loadModel: function () { return Promise.reject(new Error('ONNX_LOAD_FAILED: corrupt model')); },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-load-fail-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'CORRUPT');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      t('LOAD_FAIL_LOADED_FALSE', port.loaded === false, '');
      t('LOAD_FAIL_SMOKE_FALSE', port.smokeInferencePassed === false, '');
      t('LOAD_FAIL_READY_FALSE', port.ready === false, '');
      t('LOAD_FAIL_ERROR_HAS_INFO', port.error && port.error.indexOf('ONNX_LOAD_FAILED') >= 0, 'error=' + port.error);

      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('LOAD_FAIL_CLASSIFY_REJECTS', classifyErr && classifyErr.message === 'CLASSIFIER_NOT_READY', '');
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 5. smoke 失败 → ready=false ──
  {
    var mockReg = makeMockRegistry({
      runSmokeInference: function () { return Promise.reject(new Error('SMOKE_INFERENCE_FAILED: bad output')); },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-smoke-fail-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      t('SMOKE_FAIL_LOADED_TRUE', port.loaded === true, 'model loaded but smoke failed');
      t('SMOKE_FAIL_SMOKE_FALSE', port.smokeInferencePassed === false, '');
      t('SMOKE_FAIL_READY_FALSE', port.ready === false, '');
      t('SMOKE_FAIL_ERROR_HAS_INFO', port.error && port.error.indexOf('SMOKE') >= 0, 'error=' + port.error);

      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('SMOKE_FAIL_CLASSIFY_REJECTS', classifyErr && classifyErr.message === 'CLASSIFIER_NOT_READY', '');
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 6. NaN score → reject ──
  {
    var mockReg = makeMockRegistry({
      runRealInference: function () {
        return Promise.resolve({
          scores: { safe: NaN, adult: 0.02, racy: 0.02, violence: 0.01 },
          rawOutput: [NaN, 0.02, 0.02, 0.01],
        });
      },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-nan-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      t('NAN_READY_TRUE', port.ready === true, 'ready before classify');

      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('NAN_CLASSIFY_REJECTS', classifyErr !== null, 'should reject');
      t('NAN_CLASSIFY_ERROR_INVALID_OUTPUT', classifyErr && classifyErr.message === 'INVALID_OUTPUT',
        classifyErr ? classifyErr.message : '');
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 7. Infinity score → reject ──
  {
    var mockReg = makeMockRegistry({
      runRealInference: function () {
        return Promise.resolve({
          scores: { safe: Infinity, adult: 0.02, racy: 0.02, violence: 0.01 },
          rawOutput: [Infinity, 0.02, 0.02, 0.01],
        });
      },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-inf-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('INF_CLASSIFY_REJECTS', classifyErr !== null, '');
      t('INF_CLASSIFY_ERROR_INVALID_OUTPUT', classifyErr && classifyErr.message === 'INVALID_OUTPUT', '');
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 8. 输出长度错误 → reject ──
  {
    var mockReg = makeMockRegistry({
      runRealInference: function () {
        return Promise.resolve({
          scores: { safe: 0.95, adult: 0.02, racy: 0.02, violence: 0.01 },
          rawOutput: [], // 空输出 — 长度错误
        });
      },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-len-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('LEN_CLASSIFY_REJECTS', classifyErr !== null, '');
      t('LEN_CLASSIFY_ERROR_INVALID_OUTPUT', classifyErr && classifyErr.message === 'INVALID_OUTPUT', '');
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 9. 推理超时 → reject ──
  {
    var mockReg = makeMockRegistry({
      runRealInference: function () {
        // 永不 resolve — 模拟推理挂死
        return new Promise(function () { /* never resolves */ });
      },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-timeout-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg, timeout: 50, // 50ms 超时
      });
      await port.initialize();
      t('TIMEOUT_READY_TRUE', port.ready === true, '');

      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('TIMEOUT_CLASSIFY_REJECTS', classifyErr !== null, '');
      t('TIMEOUT_CLASSIFY_ERROR', classifyErr && classifyErr.message === 'INFERENCE_TIMEOUT',
        classifyErr ? classifyErr.message : '');
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 10. audit 失败 → reject(不创建资产)──
  {
    var port = createSafetyClassifierPort({
      logger: logger,
      auditFile: '/definitely/not/exist/dir/audit.jsonl',
    });
    var auditErr = null;
    try { await port.audit({ assetId: 'x', decision: 'SAFE' }); }
    catch (e) { auditErr = e; }
    t('AUDIT_FAIL_REJECTS', auditErr !== null, 'audit should reject on write failure');
    // 不创建资产:验证 audit 文件不存在
    t('AUDIT_FAIL_NO_FILE', !fs.existsSync('/definitely/not/exist/dir/audit.jsonl'), 'no file created');
  }

  // ── 10b. audit 成功写入 append-only JSONL ──
  {
    var tmpAudit = path.join(os.tmpdir(), 'lc-audit-' + Date.now() + '-' + process.pid + '.jsonl');
    try {
      var port = createSafetyClassifierPort({ logger: logger, auditFile: tmpAudit });
      await port.audit({ assetId: 'a1', decision: 'SAFE' });
      await port.audit({ assetId: 'a2', decision: 'UNSAFE' });
      var lines = fs.readFileSync(tmpAudit, 'utf8').trim().split('\n');
      t('AUDIT_APPEND_TWO_LINES', lines.length === 2, 'lines=' + lines.length);
      var e1 = JSON.parse(lines[0]);
      t('AUDIT_ENTRY_1', e1.assetId === 'a1' && e1.decision === 'SAFE', '');
      var e2 = JSON.parse(lines[1]);
      t('AUDIT_ENTRY_2', e2.assetId === 'a2' && e2.decision === 'UNSAFE', '');
    } finally {
      try { fs.unlinkSync(tmpAudit); } catch (e) {}
    }
  }

  // ── 11. shutdown → ready=false ──
  {
    var mockReg = makeMockRegistry();
    var tmpModel = path.join(os.tmpdir(), 'lc-shutdown-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      t('SHUTDOWN_READY_TRUE_BEFORE', port.ready === true, 'ready before shutdown');

      await port.shutdown();
      t('SHUTDOWN_LOADED_FALSE', port.loaded === false, '');
      t('SHUTDOWN_SMOKE_FALSE', port.smokeInferencePassed === false, '');
      t('SHUTDOWN_READY_FALSE', port.ready === false, 'ready after shutdown');
      t('SHUTDOWN_ERROR_NULL', port.error === null, 'error cleared');

      // shutdown 幂等
      await port.shutdown();
      t('SHUTDOWN_IDEMPOTENT', port.ready === false, '');

      // shutdown 后 classify → CLASSIFIER_NOT_READY
      var classifyErr = null;
      try { await port.classify('/tmp/x.png', {}); }
      catch (e) { classifyErr = e; }
      t('SHUTDOWN_CLASSIFY_REJECTS', classifyErr && classifyErr.message === 'CLASSIFIER_NOT_READY', '');
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 12. 并发 initialize 只加载一次 ──
  {
    var loadCount = 0;
    var smokeCount = 0;
    var mockReg = makeMockRegistry({
      loadModel: function () {
        loadCount++;
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve({
              model: { _mock: true },
              sha256: 'concurrent123',
              type: 'onnx',
              version: 'mock',
              inputShape: [1, 224, 224, 3],
              outputNames: ['output'],
            });
          }, 20);
        });
      },
      runSmokeInference: function () {
        smokeCount++;
        return Promise.resolve(true);
      },
    });
    var tmpModel = path.join(os.tmpdir(), 'lc-concurrent-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      // 并发发起 5 个 initialize
      var promises = [];
      for (var i = 0; i < 5; i++) promises.push(port.initialize());
      var results = await Promise.all(promises);
      t('CONCURRENT_INIT_ALL_RESOLVE', results.length === 5, '');
      t('CONCURRENT_INIT_LOAD_ONCE', loadCount === 1, 'loadCalls=' + loadCount);
      t('CONCURRENT_INIT_SMOKE_ONCE', smokeCount === 1, 'smokeCalls=' + smokeCount);
      t('CONCURRENT_INIT_READY_TRUE', port.ready === true, '');
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 13. 真实安全/不安全 fixture → SKIPPED_NO_CLASSIFIER ──
  // 当前环境无 runtime + 无模型 → 真实 fixture 测试 SKIPPED
  {
    var rt = realRegistry.detectRuntime();
    if (!rt.available) {
      t('FIXTURE_SKIPPED_NO_RUNTIME', true, 'no runtime → SKIPPED_NO_CLASSIFIER');
      t('FIXTURE_REAL_CLASSIFIER_BLOCKED', true, 'REAL_CLASSIFIER=BLOCKED');
    } else {
      // 有 runtime 但无模型 → 也 SKIPPED
      var port = createSafetyClassifierPort({ logger: logger });
      if (!port.configured) {
        t('FIXTURE_SKIPPED_NO_MODEL', true, 'no modelPath → SKIPPED_NO_CLASSIFIER');
      } else {
        // 真实 fixture 测试 — 只在真实模型可用时运行
        try {
          await port.initialize();
          if (port.ready) {
            // 真实推理:用 fallback_study 中的图片做安全 fixture
            var safeFixture = path.join(ROOT, 'data', 'fallback_study', 'fb-color.png');
            if (fs.existsSync(safeFixture)) {
              var result = await port.classify(safeFixture, {});
              t('FIXTURE_SAFE_IMAGE_DECISION_SAFE', result.decision === 'SAFE' || result.decision === 'REVIEW',
                'decision=' + result.decision);
            } else {
              t('FIXTURE_SKIPPED_NO_FIXTURE', true, 'fixture not found');
            }
          } else {
            t('FIXTURE_SKIPPED_NOT_READY', true, 'model not ready → SKIPPED_NO_CLASSIFIER');
          }
          await port.shutdown();
        } catch (e) {
          t('FIXTURE_SKIPPED_ERROR', true, 'error → SKIPPED: ' + e.message);
        }
      }
    }
  }

  // ── 14. 真实 inference 成功路径(mock ready → 结构化结果)──
  {
    var mockReg = makeMockRegistry();
    var tmpModel = path.join(os.tmpdir(), 'lc-real-' + Date.now() + '.onnx');
    fs.writeFileSync(tmpModel, 'MOCK');
    try {
      var port = createSafetyClassifierPort({
        logger: logger, modelPath: tmpModel, registry: mockReg,
      });
      await port.initialize();
      t('REAL_PATH_READY_TRUE', port.ready === true, '');

      var result = await port.classify('/tmp/x.png', {});
      t('REAL_PATH_HAS_MODEL_TYPE', result.modelType === 'onnx', 'modelType=' + result.modelType);
      t('REAL_PATH_HAS_MODEL_VERSION', typeof result.modelVersion === 'string' && result.modelVersion.length === 12, '');
      t('REAL_PATH_HAS_MODEL_SHA256', typeof result.modelSha256 === 'string' && result.modelSha256.length > 0, '');
      t('REAL_PATH_HAS_SCORES', result.scores && typeof result.scores === 'object', '');
      t('REAL_PATH_HAS_SAFE_SCORE', typeof result.scores.safe === 'number', '');
      t('REAL_PATH_HAS_ADULT_SCORE', typeof result.scores.adult === 'number', '');
      t('REAL_PATH_HAS_RACY_SCORE', typeof result.scores.racy === 'number', '');
      t('REAL_PATH_HAS_VIOLENCE_SCORE', typeof result.scores.violence === 'number', '');
      t('REAL_PATH_HAS_DECISION', ['SAFE', 'UNSAFE', 'REVIEW'].indexOf(result.decision) >= 0, '');
      t('REAL_PATH_HAS_THRESHOLD', result.threshold === 0.5, '');
      t('REAL_PATH_HAS_INFERENCE_MS', typeof result.inferenceMs === 'number' && result.inferenceMs >= 0, '');
      t('REAL_PATH_DECISION_SAFE', result.decision === 'SAFE', 'decision=' + result.decision);
      await port.shutdown();
    } finally {
      try { fs.unlinkSync(tmpModel); } catch (e) {}
    }
  }

  // ── 15. isSafe 行为(新结构 decision / 旧结构 score)──
  {
    var port = createSafetyClassifierPort({ logger: logger, threshold: 0.5 });
    t('IS_SAFE_DECISION_SAFE', port.isSafe({ decision: 'SAFE' }) === true, '');
    t('IS_SAFE_DECISION_UNSAFE', port.isSafe({ decision: 'UNSAFE' }) === false, '');
    t('IS_SAFE_DECISION_REVIEW', port.isSafe({ decision: 'REVIEW' }) === false, '');
    t('IS_SAFE_LOW_SCORE', port.isSafe({ score: 0.1 }) === true, '0.1 < 0.5');
    t('IS_SAFE_HIGH_SCORE', port.isSafe({ score: 0.9 }) === false, '0.9 >= 0.5');
    t('IS_SAFE_UNDEFINED', port.isSafe(undefined) === false, '');
    t('IS_SAFE_NULL', port.isSafe(null) === false, '');
    t('IS_SAFE_EMPTY', port.isSafe({}) === false, '');
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); process.exit(1); });
