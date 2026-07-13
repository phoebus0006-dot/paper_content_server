// safety-classifier-port.js — Safety classifier port (async lifecycle, real readiness truth)
//
// 异步生命周期:
//   async initialize()  — 加载模型 + smoke inference(幂等,并发安全)
//   async shutdown()    — 释放资源(幂等)
//   async classify(fp)  — 真实推理(自动 initialize 若未初始化且 runtime+model 存在)
//
// 7 级 readiness truth(诚实模型):
//   configured         = !!modelPath(提供了 modelPath,不验证文件存在)
//   modelExists        = !!modelPath && fs.existsSync(modelPath)(模型文件真实存在)
//   runtimeAvailable   = 推理 runtime(onnxruntime/tfjs-node)已安装
//   loading            = 正在加载(initialize 进行中)
//   loaded             = modelExists && runtimeAvailable && loadModel() 成功
//   smokeInferencePassed = loaded && runSmokeInference() 成功
//   inferenceReady     = loaded && smokeInferencePassed
//   ready              = inferenceReady(只有推理真正可用时才 true)
//   error              = 错误信息(如果有)
//
// 关键不变量:
//   - 文件存在 ≠ ready(modelExists=true 但 runtimeAvailable=false → ready=false)
//   - runtime 安装 ≠ ready(runtimeAvailable=true 但 loaded=false → ready=false)
//   - 模型加载 ≠ ready(loaded=true 但 smokeInferencePassed=false → ready=false)
//   - 只有 loaded=true && smokeInferencePassed=true 时 ready=true
//
// 当前环境无 runtime 时(预期 BLOCKED 状态):
//   runtimeAvailable=false, loaded=false, smokeInferencePassed=false, ready=false
//   classify() reject NO_RUNTIME_AVAILABLE(有 modelPath 但无 runtime)
//   或 CLASSIFIER_NOT_READY(无 modelPath / 文件不存在)
//
// 行为契约:
//   - 无 modelPath 或文件不存在 → classify reject(CLASSIFIER_NOT_READY)
//   - 文件存在但无 runtime → classify reject(NO_RUNTIME_AVAILABLE)
//   - 有 runtime 但模型加载失败 → classify reject(CLASSIFIER_NOT_READY)
//   - 模型加载但 smoke inference 失败 → classify reject(CLASSIFIER_NOT_READY)
//   - ready=true → classify 返回结构化推理结果(不返回假数据)
//   - audit 写入 append-only JSONL(auditFile);失败时 reject(不创建资产)
//
// 安全保证:
//   - NaN/Infinity 输出 → reject
//   - 输出长度错误 → reject
//   - 推理超时 → reject
//   - 模型缺失 → fail-closed
//   - runtime 缺失 → fail-closed
//   - 并发调用安全(initialize 幂等,用 shared promise;classify 并发安全)
//   - Audit append-only JSONL,失败时 reject(不创建资产)
//
// 结构化推理结果(ready=true 时):
//   {
//     modelType: "onnx"|"tensorflow",
//     modelVersion: "<sha256 前 12 位>",
//     modelSha256: "<完整 sha256>",
//     scores: { safe: 0.0, adult: 0.0, racy: 0.0, violence: 0.0 },
//     decision: "SAFE"|"UNSAFE"|"REVIEW",
//     threshold: 0.5,
//     inferenceMs: <number>
//   }
//
// 接口契约:
//   classify(filePath, metadata) -> Promise<structuredResult>
//     - 未配置/文件不存在 → reject(new Error('CLASSIFIER_NOT_READY'))
//     - 文件存在但无 runtime → reject(new Error('NO_RUNTIME_AVAILABLE'))
//     - loaded=false 或 smokeInferencePassed=false → reject(new Error('CLASSIFIER_NOT_READY'))
//     - 推理超时 → reject(new Error('INFERENCE_TIMEOUT'))
//     - 输出含 NaN/Infinity → reject(new Error('INVALID_OUTPUT'))
//     - ready=true → resolve(structuredResult)
//   isSafe(classification) -> bool
//     - 新结构:classification.decision === 'SAFE'
//     - 旧结构(向后兼容):classification.score < threshold
//     - 无 classification / 无 decision / 无 score → false(fail-closed)
//   audit(entry) -> Promise<void>
//   initialize() -> Promise<void>  (幂等,并发安全)
//   shutdown() -> Promise<void>    (幂等,并发安全)
//   configured / modelExists / runtimeAvailable / loading / loaded /
//   smokeInferencePassed / inferenceReady / ready / modelType / modelVersion /
//   modelSha256 / threshold / error

function createSafetyClassifierPort(options) {
  options = options || {};
  var logger = options.logger || {};
  var modelPath = options.modelPath || null;
  var modelType = options.modelType || 'tensorflow';
  var threshold = options.threshold || 0.5;
  var auditFile = options.auditFile || null;
  var timeoutMs = options.timeout || 5000;
  var fs = require('fs');
  // 可注入 registry(测试用);默认使用真实 model-loader-registry
  var registry = options.registry || require('./model-loader-registry');

  // ── 同步可定的 readiness(构造时即可知)──
  var configured = !!modelPath;
  var modelExists = !!modelPath && fs.existsSync(modelPath);
  var runtimeInfo = registry.detectRuntime();
  var runtimeAvailable = !!runtimeInfo.available;

  // ── 异步状态(由 initialize/shutdown 更新)──
  var state = {
    loading: false,
    loaded: false,
    smokeInferencePassed: false,
    error: null,
    modelSha256: '',
    loadedModelType: '',
    loadedModelVersion: '',
  };

  // 加载后的模型句柄(registry.loadModel 返回的 { model, sha256, type, version, ... })
  var loadedModelHandle = null;
  // initialize 的共享 promise(幂等 + 并发安全)
  var initPromise = null;
  // shutdown 的共享 promise
  var shutdownPromise = null;

  // ── initialize — 异步加载模型 + smoke inference ──
  // 幂等:多次调用返回同一个 promise
  // 并发安全:并发调用只触发一次真实加载
  function initialize() {
    if (initPromise) return initPromise;
    if (shutdownPromise) {
      // shutdown 后再次 initialize — 允许重新初始化
      shutdownPromise = null;
    }
    initPromise = doInitialize().catch(function (e) {
      // 出错后允许重试(清除 initPromise)
      initPromise = null;
      throw e;
    });
    return initPromise;
  }

  async function doInitialize() {
    state.loading = true;
    state.error = null;
    try {
      // 无 modelPath — 不是错误,只是未配置
      if (!configured) {
        state.loading = false;
        return;
      }
      // 模型文件不存在
      if (!modelExists) {
        state.error = 'MODEL_FILE_NOT_FOUND';
        state.loading = false;
        return;
      }
      // 无 runtime
      if (!runtimeAvailable) {
        state.error = 'NO_RUNTIME_AVAILABLE';
        state.loading = false;
        return;
      }

      // 加载模型
      try {
        loadedModelHandle = await registry.loadModel(modelPath, runtimeInfo);
        state.loaded = true;
        state.modelSha256 = loadedModelHandle.sha256 || '';
        state.loadedModelType = loadedModelHandle.type || '';
        state.loadedModelVersion = loadedModelHandle.version || '';
        if (logger.info) logger.info('Safety classifier: model loaded (sha256=' + state.modelSha256.substring(0, 12) + ')');
      } catch (e) {
        state.loaded = false;
        state.smokeInferencePassed = false;
        state.error = e && e.message || 'LOAD_FAILED';
        if (logger.warn) logger.warn('Safety classifier: model load failed: ' + state.error);
        return;
      }

      // smoke inference
      try {
        var smokeOk = await registry.runSmokeInference(loadedModelHandle, runtimeInfo);
        state.smokeInferencePassed = !!smokeOk;
        if (state.smokeInferencePassed) {
          if (logger.info) logger.info('Safety classifier: smoke inference passed');
        } else {
          state.error = 'SMOKE_INFERENCE_FAILED';
          if (logger.warn) logger.warn('Safety classifier: smoke inference returned false');
        }
      } catch (e) {
        state.smokeInferencePassed = false;
        state.error = e && e.message || 'SMOKE_INFERENCE_FAILED';
        if (logger.warn) logger.warn('Safety classifier: smoke inference failed: ' + state.error);
      }
    } finally {
      state.loading = false;
    }
  }

  // ── shutdown — 释放资源 ──
  // 幂等:多次调用返回同一个 promise
  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = doShutdown();
    return shutdownPromise;
  }

  async function doShutdown() {
    // 等待正在进行的 initialize 完成(避免资源竞争)
    if (initPromise) {
      try { await initPromise; } catch (e) { /* ignore */ }
    }

    // 释放模型句柄
    if (loadedModelHandle && loadedModelHandle.model) {
      var model = loadedModelHandle.model;
      // ONNX session.release() / TFJS model.dispose()
      try {
        if (typeof model.release === 'function') await model.release();
        else if (typeof model.dispose === 'function') await model.dispose();
      } catch (e) {
        if (logger.warn) logger.warn('Safety classifier: shutdown release error: ' + (e && e.message));
      }
    }
    loadedModelHandle = null;
    state.loaded = false;
    state.smokeInferencePassed = false;
    state.loading = false;
    state.error = null;
    state.modelSha256 = '';
    state.loadedModelType = '';
    state.loadedModelVersion = '';
    initPromise = null;
  }

  // ── classify — 真实推理或 reject(fail-closed)──
  async function classify(filePath, metadata) {
    // 无模型文件 → CLASSIFIER_NOT_READY
    if (!modelExists) {
      throw new Error('CLASSIFIER_NOT_READY');
    }
    // 有模型文件但无 runtime → NO_RUNTIME_AVAILABLE
    if (!runtimeAvailable) {
      throw new Error('NO_RUNTIME_AVAILABLE');
    }

    // 如果 model+runtime 都在但还没加载,自动 initialize
    if (!state.loaded && !state.loading && !state.error && !shutdownPromise) {
      await initialize();
    } else if (state.loading && initPromise) {
      // 等待正在进行的 initialize
      await initPromise;
    }

    // 有 runtime 但模型未加载或 smoke inference 未通过 → CLASSIFIER_NOT_READY
    if (!state.loaded) {
      throw new Error('CLASSIFIER_NOT_READY');
    }
    if (!state.smokeInferencePassed) {
      throw new Error('CLASSIFIER_NOT_READY');
    }

    // ready=true → 运行真实推理(带超时)
    var startTime = Date.now();
    var inferenceResult;
    try {
      inferenceResult = await runInferenceWithTimeout(filePath);
    } catch (e) {
      if (e && e.message === 'INFERENCE_TIMEOUT') throw e;
      // 推理失败 → fail-closed
      throw new Error('CLASSIFIER_NOT_READY');
    }
    var inferenceMs = Date.now() - startTime;

    // 安全保证:校验输出
    var scores = inferenceResult.scores;
    var rawOutput = inferenceResult.rawOutput;

    // 输出长度错误 → reject
    if (!Array.isArray(rawOutput) || rawOutput.length === 0) {
      throw new Error('INVALID_OUTPUT');
    }
    // NaN/Infinity 在 rawOutput → reject
    for (var i = 0; i < rawOutput.length; i++) {
      var v = Number(rawOutput[i]);
      if (isNaN(v) || !isFinite(v)) {
        throw new Error('INVALID_OUTPUT');
      }
    }
    // scores 校验(4 字段,无 NaN/Inf,值在 [0,1])
    if (!registry.validateScores(scores)) {
      throw new Error('INVALID_OUTPUT');
    }

    // 计算 decision
    var decision = computeDecision(scores, threshold);

    return {
      modelType: state.loadedModelType || (configured ? modelType : ''),
      modelVersion: state.modelSha256 ? state.modelSha256.substring(0, 12) : 'NONE',
      modelSha256: state.modelSha256,
      scores: scores,
      decision: decision,
      threshold: threshold,
      inferenceMs: inferenceMs,
    };
  }

  // runInferenceWithTimeout — 带超时的推理
  function runInferenceWithTimeout(filePath) {
    var inferencePromise = registry.runRealInference(loadedModelHandle, runtimeInfo, filePath);
    var timer = null;
    var timeoutPromise = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        reject(new Error('INFERENCE_TIMEOUT'));
      }, timeoutMs);
    });
    return Promise.race([
      inferencePromise.then(function (result) {
        if (timer) clearTimeout(timer);
        return result;
      }, function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      }),
      timeoutPromise,
    ]);
  }

  // computeDecision — 根据 scores 和 threshold 计算 decision
  // adult + racy + violence > threshold → UNSAFE
  // 否则 → SAFE
  function computeDecision(scores, thresh) {
    var unsafeScore = (scores.adult || 0) + (scores.racy || 0) + (scores.violence || 0);
    if (unsafeScore >= thresh) return 'UNSAFE';
    // 边界情况:unsafe 接近 threshold → REVIEW
    if (unsafeScore >= thresh * 0.8) return 'REVIEW';
    return 'SAFE';
  }

  // isSafe — 判断分类结果是否安全
  // 新结构:classification.decision === 'SAFE'
  // 旧结构(向后兼容):classification.score < threshold
  function isSafe(classification) {
    if (!classification) return false;
    if (classification.decision !== undefined) {
      return classification.decision === 'SAFE';
    }
    if (classification.score === undefined) return false;
    return classification.score < threshold;
  }

  // audit — append-only JSONL audit log
  // 失败时 reject(不静默丢弃,由上层 rollback 资产)
  function audit(entry) {
    if (!auditFile) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var line = JSON.stringify(entry) + '\n';
      fs.appendFile(auditFile, line, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ── 返回 port 对象(getters 反映实时状态)──
  var port = {
    initialize: initialize,
    shutdown: shutdown,
    classify: classify,
    isSafe: isSafe,
    audit: audit,
    // 模型元信息
    threshold: threshold,
    timeoutMs: timeoutMs,
  };

  // 用 getter 暴露实时状态
  Object.defineProperty(port, 'configured', { get: function () { return configured; }, enumerable: true });
  Object.defineProperty(port, 'modelExists', { get: function () { return modelExists; }, enumerable: true });
  Object.defineProperty(port, 'runtimeAvailable', { get: function () { return runtimeAvailable; }, enumerable: true });
  Object.defineProperty(port, 'loading', { get: function () { return state.loading; }, enumerable: true });
  Object.defineProperty(port, 'loaded', { get: function () { return state.loaded; }, enumerable: true });
  Object.defineProperty(port, 'smokeInferencePassed', { get: function () { return state.smokeInferencePassed; }, enumerable: true });
  Object.defineProperty(port, 'inferenceReady', {
    get: function () { return state.loaded && state.smokeInferencePassed; },
    enumerable: true,
  });
  Object.defineProperty(port, 'ready', {
    get: function () { return state.loaded && state.smokeInferencePassed; },
    enumerable: true,
  });
  Object.defineProperty(port, 'error', { get: function () { return state.error; }, enumerable: true });
  Object.defineProperty(port, 'modelType', {
    get: function () { return state.loadedModelType || (configured ? modelType : ''); },
    enumerable: true,
  });
  Object.defineProperty(port, 'modelVersion', {
    get: function () { return state.loaded && state.modelSha256 ? state.modelSha256.substring(0, 12) : 'NONE'; },
    enumerable: true,
  });
  Object.defineProperty(port, 'modelSha256', {
    get: function () { return state.modelSha256 || ''; },
    enumerable: true,
  });

  return port;
}

module.exports = { createSafetyClassifierPort: createSafetyClassifierPort };
