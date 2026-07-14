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
      // Audit write failure must not hide original error
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
