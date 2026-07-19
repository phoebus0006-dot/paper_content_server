// safety-audit-log.js — Append-only audit with FAILED status support
var path = require('path');
var fsp = require('fs').promises;

function SafetyAuditLog(logFile, logger) {
  logFile = logFile || 'data/safety-audit.log';
  logger = logger || {};

  function append(entry) {
    if (!entry || !entry.assetId) return Promise.reject(new Error('audit entry requires assetId'));
    var line = JSON.stringify({ timestamp: new Date().toISOString(), status: entry.status || 'SUCCESS', stage: entry.stage || null, error: entry.error || null, ...entry }) + '\n';
    return fsp.appendFile(logFile, line, 'utf8').catch(function(e) {
      logger.error && logger.error('audit write failed: ' + e.message);
      // 之前 .catch 返回 undefined 静默吞错，违反 fail-closed 契约：
      // asset-delete-service 期望 audit 失败时 reject 触发 rollback，
      // 静默吞错让删除流水线继续提交，破坏数据安全。
      // 现在改为 rethrow，让上层 catch 处理。
      var wrappedErr = new Error('AUDIT_FAILED: ' + e.message);
      wrappedErr.cause = e;
      throw wrappedErr;
    });
  }

  function readAll() {
    return fsp.readFile(logFile, 'utf8').then(function(text) {
      return text.trim().split('\n').filter(Boolean).map(function(line) { return JSON.parse(line); });
    }).catch(function(err) { if (err.code === 'ENOENT') return []; throw err; });
  }

  return { append: append, readAll: readAll };
}
module.exports = { SafetyAuditLog: SafetyAuditLog };
