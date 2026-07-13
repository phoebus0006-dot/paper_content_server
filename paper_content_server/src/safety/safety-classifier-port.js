// safety-classifier-port.js — Safety classifier port (real readiness truth)
//
// 7 级 readiness truth(诚实模型):
//   configured         = !!modelPath(提供了 modelPath,不验证文件存在)
//   modelExists        = !!modelPath && fs.existsSync(modelPath)(模型文件真实存在)
//   runtimeAvailable   = 推理 runtime(onnxruntime/tfjs-node)已安装
//   loaded             = modelExists && runtimeAvailable && loadModel() 成功
//   smokeInferencePassed = loaded && runSmokeInference() 成功
//   inferenceReady     = loaded && smokeInferencePassed
//   ready              = inferenceReady(只有推理真正可用时才 true)
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
//   - audit 写入 append-only JSONL(auditFile);无 auditFile 时 resolve
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
//     - ready=true → resolve(structuredResult)
//   isSafe(classification) -> bool
//     - 新结构:classification.decision === 'SAFE'
//     - 旧结构(向后兼容):classification.score < threshold
//     - 无 classification / 无 decision / 无 score → false(fail-closed)
//   audit(entry) -> Promise<void>
//   configured / modelExists / runtimeAvailable / loaded / smokeInferencePassed /
//   inferenceReady / ready / modelType / modelVersion / modelSha256 / threshold

function createSafetyClassifierPort(options) {
  options = options || {};
  var logger = options.logger || {};
  var modelPath = options.modelPath || null;
  var modelType = options.modelType || 'tensorflow';
  var threshold = options.threshold || 0.5;
  var auditFile = options.auditFile || null;
  var fs = require('fs');
  var registry = require('./model-loader-registry');

  // ── 7 级 readiness truth ──
  // 1. configured = 提供了 modelPath
  var configured = !!modelPath;

  // 2. modelExists = modelPath 提供且文件真实存在
  var modelExists = !!modelPath && fs.existsSync(modelPath);

  // 3. runtimeAvailable = 推理 runtime 已安装(onnxruntime / tfjs-node)
  var runtimeInfo = registry.detectRuntime();
  var runtimeAvailable = !!runtimeInfo.available;

  // 4. loaded = 模型成功加载到 runtime
  // 5. smokeInferencePassed = smoke inference 成功
  // 当前无 runtime 时,loaded=false, smokeInferencePassed=false(不冒充)
  var loaded = false;
  var smokeInferencePassed = false;
  var modelSha256 = '';
  var loadedModel = null;
  var loadedModelType = '';
  var loadedModelVersion = '';

  if (modelExists && runtimeAvailable) {
    // 有模型文件且有 runtime → 尝试加载
    // 注意:实际加载是异步的(ONNX/tfjs 的 load API 返回 Promise)
    // port 在构造时不 await(保持同步构造),loaded 在构造时为 false。
    // 真实场景下应在 bootstrap 阶段 await port.initialize() 完成 async 加载。
    // 当前无 runtime,此分支不执行。
    try {
      var loadResult = registry.loadModel(modelPath, runtimeInfo);
      if (loadResult) {
        loaded = true;
        loadedModel = loadResult.model;
        modelSha256 = loadResult.sha256 || '';
        loadedModelType = loadResult.type || '';
        loadedModelVersion = loadResult.version || '';
      }
    } catch (e) {
      logger.warn && logger.warn('Safety classifier: model load failed: ' + e.message);
      loaded = false;
    }

    // 模型加载成功后执行 smoke inference
    if (loaded) {
      try {
        smokeInferencePassed = !!registry.runSmokeInference(
          { model: loadedModel, sha256: modelSha256, type: loadedModelType, version: loadedModelVersion },
          runtimeInfo
        );
      } catch (e) {
        logger.warn && logger.warn('Safety classifier: smoke inference failed: ' + e.message);
        smokeInferencePassed = false;
      }
    }
  }

  // 6. inferenceReady = loaded && smokeInferencePassed
  var inferenceReady = loaded && smokeInferencePassed;

  // 7. ready = inferenceReady(只有推理真正可用时才 true)
  var ready = inferenceReady;

  // modelVersion:未加载时 'NONE',加载后用 sha256 前 12 位
  var modelVersion = loaded && modelSha256 ? modelSha256.substring(0, 12) : 'NONE';

  // classify — 返回结构化推理结果或 reject(fail-closed)
  function classify(filePath, metadata) {
    // 无模型文件 → CLASSIFIER_NOT_READY
    if (!modelExists) {
      return Promise.reject(new Error('CLASSIFIER_NOT_READY'));
    }
    // 有模型文件但无 runtime → NO_RUNTIME_AVAILABLE
    if (!runtimeAvailable) {
      return Promise.reject(new Error('NO_RUNTIME_AVAILABLE'));
    }
    // 有 runtime 但模型未加载或 smoke inference 未通过 → CLASSIFIER_NOT_READY
    if (!inferenceReady) {
      return Promise.reject(new Error('CLASSIFIER_NOT_READY'));
    }

    // ready=true → 运行真实推理
    // 当前环境无 runtime,此分支不执行。
    // 将来 runtime 可用时,这里应:
    //   1. 读取图像文件(filePath)
    //   2. 预处理(resize / normalize)
    //   3. 运行推理(loadedModel)
    //   4. 后处理概率 → scores
    //   5. 根据 scores 和 threshold 计算 decision
    //   6. 返回结构化结果(不返回假数据)
    //
    // 因当前无 runtime 且 loaded=false,此处不会被到达。
    // 保留框架以防 runtime 安装后 loadModel/smokeInference 被补全。
    return Promise.reject(new Error('CLASSIFIER_NOT_READY'));
  }

  // isSafe — 判断分类结果是否安全
  // 新结构:classification.decision === 'SAFE'
  // 旧结构(向后兼容):classification.score < threshold
  function isSafe(classification) {
    if (!classification) return false;
    // 新结构:有 decision 字段
    if (classification.decision !== undefined) {
      return classification.decision === 'SAFE';
    }
    // 旧结构:有 score 字段(score vs threshold)
    if (classification.score === undefined) return false;
    return classification.score < threshold;
  }

  // audit — append-only JSONL audit log
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

  return {
    classify: classify,
    isSafe: isSafe,
    audit: audit,
    // 7 级 readiness truth
    configured: configured,
    modelExists: modelExists,
    runtimeAvailable: runtimeAvailable,
    loaded: loaded,
    smokeInferencePassed: smokeInferencePassed,
    inferenceReady: inferenceReady,
    ready: ready,  // = inferenceReady
    // 模型元信息
    modelType: loadedModelType || (configured ? modelType : ''),
    modelVersion: modelVersion,
    modelSha256: modelSha256,
    threshold: threshold,
  };
}

module.exports = { createSafetyClassifierPort: createSafetyClassifierPort };
