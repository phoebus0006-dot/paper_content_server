// nsfw-safety-gate.js — 上传资源的安全闸门(兼容层)
//
// 旧实现基于文件名启发式(扩展名/关键词)做主判断,无法识别真实 NSFW 内容。
// 新版本改为委托给 SafetyClassifierPort:真实分类由 classifier 完成,
// 文件名启发式只作为附加规则(快速拒绝明显违规的文件名,不作为主判断)。
//
// classifier 不可用时 fail-closed:classify 返回无 decision / 无 score 的标记,
// processUpload 据此返回 FEATURE_NOT_READY(classifier 未就绪,非内容拒绝)。
//
// classify 返回值:
//   - 启发式拒绝 → { decision: 'UNSAFE', reason: 'HEURISTIC_REJECT', scores: { heuristic: 1.0 }, ... }
//   - classifier 未就绪 → { score: undefined, category: 'UNAVAILABLE', reason: 'CLASSIFIER_NOT_READY'|'NO_RUNTIME_AVAILABLE' }
//   - classifier 就绪 → 结构化推理结果 { decision, scores: {safe,adult,racy,violence}, modelType, ... }
//
// 接口:
//   classify(filePath, metadata) -> Promise<{ decision?, score?, category?, modelVersion, scores?, reason? }>
//   isSafe(classification) -> bool  (接受 classification 对象,不再接受 filePath)
//   audit(entry) -> Promise<void>
//   configured -> bool
var path = require('path');
var { createSafetyClassifierPort } = require('./safety-classifier-port');

var ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
var MAX_FILE_SIZE = 50 * 1024 * 1024;
var MAX_DIMENSION = 8192;
var BLOCKED_KEYWORDS = ['nsfw', 'explicit', 'adult', 'porn', 'xxx', 'nude'];

// 附加规则:基于 metadata 的启发式(只作为附加规则,不是主判断)
// - 维度/大小超限:快速拒绝
// - 文件名含违规关键词:快速拒绝
// 返回 { ok: true } 或 { ok: false, reason, ... }
function heuristicCheck(metadata) {
  if (metadata) {
    if (metadata.fileSize && metadata.fileSize > MAX_FILE_SIZE) {
      return { ok: false, reason: 'OVERSIZED_FILE', size: metadata.fileSize };
    }
    if (metadata.width && metadata.width > MAX_DIMENSION) {
      return { ok: false, reason: 'OVERSIZED_WIDTH', width: metadata.width };
    }
    if (metadata.height && metadata.height > MAX_DIMENSION) {
      return { ok: false, reason: 'OVERSIZED_HEIGHT', height: metadata.height };
    }
    var name = (metadata.originalName || '').toLowerCase();
    for (var i = 0; i < BLOCKED_KEYWORDS.length; i++) {
      if (name.indexOf(BLOCKED_KEYWORDS[i]) >= 0) {
        return { ok: false, reason: 'BLOCKED_KEYWORD', keyword: BLOCKED_KEYWORDS[i] };
      }
    }
  }
  return { ok: true };
}

function createNsfwSafetyGate(options) {
  options = options || {};
  var logger = options.logger || { info: function () {}, warn: function () {}, error: function () {} };
  var classifierPort = options.classifierPort || createSafetyClassifierPort({
    logger: logger,
    modelPath: options.modelPath || null,
    threshold: options.threshold,
  });

  // isSafe 现在接受 classification 对象(不是 filePath)
  // fail-closed:无 classification、无 decision 且无 score → false
  function isSafe(classification) {
    if (!classification) return false;
    // 新结构:有 decision 字段 → decision === 'SAFE'
    if (classification.decision !== undefined) {
      return classification.decision === 'SAFE';
    }
    // 旧结构:有 score 字段 → score < threshold
    if (classification.score === undefined) return false;
    return classifierPort.isSafe(classification);
  }

  // classify:先跑附加启发式,再委托给真实 classifier
  // - 启发式拒绝 → 返回 decision='UNSAFE' 的分类(含 score=1.0 向后兼容)
  // - classifier 不可用/未就绪 → 返回无 decision / 无 score 的标记(由上层 fail-closed)
  // - 其他异常 → 重新抛出(由上层走 ERROR CLASSIFIER_FAILED)
  async function classify(filePath, metadata) {
    var heuristic = heuristicCheck(metadata);
    if (!heuristic.ok) {
      logger.warn('NSFW gate: heuristic reject: ' + heuristic.reason);
      return {
        decision: 'UNSAFE',
        score: 1.0,
        category: 'HEURISTIC_REJECT',
        modelVersion: classifierPort.modelVersion || 'HEURISTIC',
        reason: heuristic.reason,
        scores: { heuristic: 1.0 },
      };
    }
    try {
      return await classifierPort.classify(filePath, metadata);
    } catch (e) {
      // classifier 未就绪(无模型/无 runtime/加载失败/smoke 失败)→ fail-closed 标记
      // 上层(custom-library-service)据此返回 FEATURE_NOT_READY
      if (e.message === 'CLASSIFIER_NOT_READY' ||
          e.message === 'NO_RUNTIME_AVAILABLE') {
        return {
          score: undefined,
          category: 'UNAVAILABLE',
          modelVersion: classifierPort.modelVersion,
          reason: e.message,
        };
      }
      // 其他异常向上抛出
      throw e;
    }
  }

  function audit(entry) {
    return classifierPort.audit(entry);
  }

  return {
    isSafe: isSafe,
    classify: classify,
    audit: audit,
    classifierPort: classifierPort,
    ALLOWED_EXT: ALLOWED_EXT,
    configured: classifierPort.configured,
    modelVersion: classifierPort.modelVersion,
  };
}

module.exports = { createNsfwSafetyGate: createNsfwSafetyGate };
