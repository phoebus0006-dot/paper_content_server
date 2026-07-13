// safety-classifier-port.js — Safety classifier port
//
// 选择 B:当前不接入真实模型,fail-closed。port 暴露 5 级 readiness truth:
//   - configured    = !!modelPath(提供了配置,不要求文件存在)
//   - modelExists   = !!modelPath && fs.existsSync(modelPath)(模型文件真实存在)
//   - loaded        = false(当前无 runtime 加载实现,始终 false)
//   - inferenceReady = false(当前无 smoke inference 实现,始终 false)
//   - ready         = inferenceReady(只有推理真正可用时才 true → 当前始终 false)
//
// 关键:只要没有真实推理实现,ready 永远为 false —— 即使用户把任意存在的
// 文件路径设为 NSFW_MODEL_PATH,configured=true / modelExists=true,但
// loaded=false / inferenceReady=false / ready=false。
//
// 行为契约:
//   - 无 modelPath 或文件不存在 → classify reject(NO_CLASSIFIER_MODEL_CONFIGURED)
//   - 文件存在但推理未实现 → classify reject(CLASSIFIER_NOT_IMPLEMENTED)(不改变行为)
//   - audit 写入 append-only JSONL(auditFile);无 auditFile 时 resolve
//
// 接口契约:
//   classify(filePath, metadata) -> Promise<{ score, category, modelVersion, scores }>
//     - score: 数值,越高越不安全(0..1)
//     - scores: 各类别分数明细
//     - 未配置模型时 reject(new Error('NO_CLASSIFIER_MODEL_CONFIGURED'))
//     - 已配置但推理未实现时 reject(new Error('CLASSIFIER_NOT_IMPLEMENTED'))
//   isSafe(classification) -> bool
//     - score < threshold(fail-closed 由 classify reject 保证:无 score 时 isSafe 返回 false)
//   audit(entry) -> Promise<void>
//     - 写入 auditFile(append-only JSON Lines);无 auditFile 时 resolve
//   configured -> bool(提供了 modelPath)
//   modelExists -> bool(模型文件真实存在)
//   loaded -> bool(runtime 加载成功,当前始终 false)
//   inferenceReady -> bool(smoke inference 成功,当前始终 false)
//   ready -> bool(= inferenceReady,当前始终 false)
//   modelVersion -> string
//   threshold -> number
//
// 将来接入真实模型时,只需:
//   loaded = tryLoadModel(modelPath)       // 启动时加载一次
//   inferenceReady = loaded && runSmokeInference()
//   ready = inferenceReady
// 当前没有这些实现,所以下面 loaded / inferenceReady / ready 直接置 false。

function createSafetyClassifierPort(options) {
  options = options || {};
  var logger = options.logger || {};
  var modelPath = options.modelPath || null;
  var modelType = options.modelType || 'tensorflow';
  var threshold = options.threshold || 0.5;
  var auditFile = options.auditFile || null;
  var fs = require('fs');

  // 5 级 readiness truth:
  //   configured  = 提供了 modelPath(不验证文件存在)
  //   modelExists = modelPath 提供且文件真实存在(防止误配置)
  var configured = !!modelPath;
  var modelExists = !!modelPath && fs.existsSync(modelPath);

  // 当前没有 runtime 模型加载实现,也没有 smoke inference 实现。
  // 将来接入真实推理时,这里应改为:
  //   var loaded = modelExists ? tryLoadModel(modelPath) : false;
  //   var inferenceReady = loaded && runSmokeInference();
  // 当前直接置 false —— ready 始终为 false,直到真实推理可用。
  var loaded = false;
  var inferenceReady = false;
  // ready 只有在推理真正可用时才 true。当前 classify 返回 CLASSIFIER_NOT_IMPLEMENTED,
  // 所以 ready 始终 false。
  var ready = inferenceReady;

  function classify(filePath, metadata) {
    // 无真实模型文件时 fail-closed(行为与之前一致:用 modelExists 作为门)
    if (!modelExists) {
      return Promise.reject(new Error('NO_CLASSIFIER_MODEL_CONFIGURED'));
    }
    // 如果有模型路径但模型加载失败
    // TODO: 当真实模型可用时,这里应该:
    // 1. 加载模型(启动时一次)
    // 2. 读取图像
    // 3. 运行推理
    // 4. 返回 { score, category, modelVersion, scores: {...} }
    return Promise.reject(new Error('CLASSIFIER_NOT_IMPLEMENTED'));
  }

  function isSafe(classification) {
    if (!classification || classification.score === undefined) return false;
    return classification.score < threshold;
  }

  function audit(entry) {
    // append-only audit log
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
    configured: configured,
    modelExists: modelExists,
    loaded: loaded,
    inferenceReady: inferenceReady,
    ready: ready,  // = inferenceReady; 当前始终 false(无推理实现)
    modelVersion: modelExists ? 'STUB_1.0' : 'NONE',
    threshold: threshold,
  };
}

module.exports = { createSafetyClassifierPort: createSafetyClassifierPort };
