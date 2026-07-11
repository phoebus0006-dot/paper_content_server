// safety-audit-log.js — Append-only safety audit log

var path = require('path');
var writeFileAtomic = require(path.join(__dirname, '..', 'infra', 'atomic-file')).writeFileAtomic;
var fsp = require('fs').promises;

function SafetyAuditLog(logFile, logger) {
  logFile = logFile || 'data/safety-audit.log';
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function append(entry) {
    if (!entry || !entry.assetId) return Promise.reject(new Error('audit entry requires assetId'));
    var line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
    return fsp.appendFile(logFile, line, 'utf8').then(function() {
      logger.info('Audit: ' + entry.action + ' ' + entry.assetId);
    });
  }

  function readAll() {
    return fsp.readFile(logFile, 'utf8').then(function(text) {
      return text.trim().split('\n').filter(Boolean).map(function(line) { return JSON.parse(line); });
    }).catch(function(err) { if (err.code === 'ENOENT') return []; throw err; });
  }

  return { append, readAll };
}

module.exports = { SafetyAuditLog: SafetyAuditLog };
