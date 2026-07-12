// nsfw-safety-gate.js — 上传资源的安全闸门
// 简化实现:基于文件大小/维度/扩展名的启发式检查
// 真实环境应接入专用 NSFW 检测模型,这里提供可工作的 stub
var path = require('path');
var ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
var MAX_FILE_SIZE = 50 * 1024 * 1024;
var MAX_DIMENSION = 8192;

function createNsfwSafetyGate(options) {
  options = options || {};
  var logger = options.logger || { info: function(){}, warn: function(){}, error: function(){} };

  function isSafe(filePath, metadata) {
    if (!filePath) return false;
    var ext = path.extname(filePath).toLowerCase();
    if (ALLOWED_EXT.indexOf(ext) < 0) {
      logger.warn('NSFW gate: rejected unsupported extension: ' + ext);
      return false;
    }
    if (metadata) {
      if (metadata.size && metadata.size > MAX_FILE_SIZE) {
        logger.warn('NSFW gate: rejected oversized file: ' + metadata.size);
        return false;
      }
      if (metadata.width && metadata.width > MAX_DIMENSION) {
        logger.warn('NSFW gate: rejected oversized width: ' + metadata.width);
        return false;
      }
      if (metadata.height && metadata.height > MAX_DIMENSION) {
        logger.warn('NSFW gate: rejected oversized height: ' + metadata.height);
        return false;
      }
    }
    // 启发式:文件名包含 nsfw/explicit/adult 等关键词则拒绝
    var basename = path.basename(filePath).toLowerCase();
    var blockedKeywords = ['nsfw', 'explicit', 'adult', 'porn', 'xxx', 'nude'];
    for (var i = 0; i < blockedKeywords.length; i++) {
      if (basename.indexOf(blockedKeywords[i]) >= 0) {
        logger.warn('NSFW gate: rejected blocked keyword in filename: ' + blockedKeywords[i]);
        return false;
      }
    }
    return true;
  }

  return { isSafe: isSafe, ALLOWED_EXT: ALLOWED_EXT };
}

module.exports = { createNsfwSafetyGate: createNsfwSafetyGate };
