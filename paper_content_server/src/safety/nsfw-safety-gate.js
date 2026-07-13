// nsfw-safety-gate.js — 上传资源的安全闸门(兼容层)
//
// 旧实现基于文件名启发式(扩展名/关键词)做主判断,无法识别真实 NSFW 内容。
// 新版本改为委托给 SafetyClassifierPort:真实分类由 classifier 完成,
// 文件名启发式只作为附加规则(快速拒绝明显违规的文件名,不作为主判断)。
//
// 未配置真实 classifier 时 fail-closed:classify 返回无 score 的分类,
// processUpload 会据此返回 REJECTED + FAIL_CLOSED。
//
// 接口:
//   classify(filePath, metadata) -> Promise<{ score?, category, modelVersion, scores?, reason? }>
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
  // fail-closed:无 classification 或无 score → false
  function isSafe(classification) {
    if (!classification || classification.score === undefined) return false;
    return classifierPort.isSafe(classification);
  }

  // classify:先跑附加启发式,再委托给真实 classifier
  // - 启发式拒绝 → 返回 score=1.0 的 UNSAFE 分类
  // - classifier 不可用/未配置 → 返回无 score 的分类(由上层 fail-closed)
  // - 其他异常 → 重新抛出(由上层走 ERROR CLASSIFIER_FAILED)
  async function classify(filePath, metadata) {
    var heuristic = heuristicCheck(metadata);
    if (!heuristic.ok) {
      logger.warn('NSFW gate: heuristic reject: ' + heuristic.reason);
      return {
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
      // classifier 未配置或未实现 → fail-closed:返回无 score 的分类
      if (e.message === 'NO_CLASSIFIER_MODEL_CONFIGURED' ||
          e.message === 'CLASSIFIER_NOT_IMPLEMENTED') {
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
