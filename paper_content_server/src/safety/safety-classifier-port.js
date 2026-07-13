// safety-classifier-port.js — Safety classifier port
// 真实环境应接入 NSFW 图像分类模型(如 TensorFlow.js / ONNX runtime)
// 未配置真实 classifier 时 fail-closed:任何上传都不会被判为安全
//
// 接口契约:
//   classify(filePath, metadata) -> Promise<{ score, category, modelVersion, scores }>
//     - score: 数值,越高越不安全(0..1)
//     - scores: 各类别分数明细
//     - 未配置模型时 reject(new Error('NO_CLASSIFIER_MODEL_CONFIGURED'))
//   isSafe(classification) -> bool
//     - fail-closed:无模型时永远返回 false
//   audit(entry) -> Promise<void>
//   configured -> bool
//   modelVersion -> string

function createSafetyClassifierPort(options) {
  options = options || {};
  var logger = options.logger || {};
  var modelPath = options.modelPath || null;
  var threshold = options.threshold != null ? options.threshold : 0.5;

  // 无模型 → fail-closed:reject 所有分类请求,isSafe 永远 false
  if (!modelPath) {
    return {
      classify: function (filePath, metadata) {
        if (logger.warn) {
          logger.warn('SafetyClassifierPort: no model configured, FAIL_CLOSED');
        }
        return Promise.reject(new Error('NO_CLASSIFIER_MODEL_CONFIGURED'));
      },
      isSafe: function (classification) {
        // fail-closed:即便外部传入 classification,无模型时一律不安全
        return false;
      },
      audit: function (entry) {
        // audit 永不失败(否则会阻塞 upload 清理),只是丢弃
        return Promise.resolve();
      },
      configured: false,
      modelVersion: 'NONE',
      threshold: threshold,
    };
  }

  // 有 modelPath 但当前未接入真实推理引擎 → 同样 fail-closed
  // 真实实现需要:加载模型 → 读取图像 → 推理 → 返回 { score, category, modelVersion, scores }
  return {
    classify: function (filePath, metadata) {
      // TODO: 当 modelPath 指向真实模型时,执行推理
      // 当前:即使有 modelPath 也 fail-closed,因为没有真实推理引擎
      return Promise.reject(new Error('CLASSIFIER_NOT_IMPLEMENTED'));
    },
    isSafe: function (classification) {
      if (!classification || classification.score === undefined) return false;
      return classification.score < threshold;
    },
    audit: function (entry) {
      // 真实环境应写入 append-only audit log,这里仅占位
      return Promise.resolve();
    },
    configured: true,
    modelVersion: 'STUB_1.0',
    threshold: threshold,
  };
}

module.exports = { createSafetyClassifierPort: createSafetyClassifierPort };
