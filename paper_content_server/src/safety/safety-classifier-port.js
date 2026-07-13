// safety-classifier-port.js — Safety classifier port
//
// 选择 B:当前不接入真实模型,fail-closed。但 port 的 API 更明确:
//   - configured = !!modelPath && fs.existsSync(modelPath)
//   - ready = configured(有模型才算 ready)
//   - 无模型时 classify reject(NO_CLASSIFIER_MODEL_CONFIGURED)
//   - 已配置但推理未实现时 classify reject(CLASSIFIER_NOT_IMPLEMENTED)
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
//   configured -> bool
//   ready -> bool(= configured)
//   modelVersion -> string
//   threshold -> number

function createSafetyClassifierPort(options) {
  options = options || {};
  var logger = options.logger || {};
  var modelPath = options.modelPath || null;
  var modelType = options.modelType || 'tensorflow';
  var threshold = options.threshold || 0.5;
  var auditFile = options.auditFile || null;
  var fs = require('fs');

  // 当前不接模型,configured=false,readiness=false
  // 有 modelPath 还要求文件真实存在(防止误配置)
  var configured = !!modelPath && fs.existsSync(modelPath);

  function classify(filePath, metadata) {
    // 无真实模型时 fail-closed
    if (!configured) {
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
    ready: configured,  // ready = configured(有模型才算 ready)
    modelVersion: configured ? 'STUB_1.0' : 'NONE',
    threshold: threshold,
  };
}

module.exports = { createSafetyClassifierPort: createSafetyClassifierPort };
