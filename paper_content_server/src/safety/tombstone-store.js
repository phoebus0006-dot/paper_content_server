// tombstone-store.js — Immutable tombstone records for deleted assets
// No image bytes, no sensitive data.

var path = require('path');
var writeFileAtomic = require(path.join(__dirname, '..', 'infra', 'atomic-file')).writeFileAtomic;
var fsp = require('fs').promises;

function TombstoneStore(tombstoneDir, logger) {
  tombstoneDir = tombstoneDir || 'data/tombstones';
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };

  function ensureDir() { return fsp.mkdir(tombstoneDir, { recursive: true }); }

  function write(record) {
    if (!record || !record.assetId) return Promise.reject(new Error('tombstone requires assetId'));
    var filePath = path.join(tombstoneDir, record.assetId + '.json');
    var allowed = { assetId: 1, reason: 1, decision: 1, deletedAt: 1, originalSha256: 1,
      sourceType: 1, libraryType: 1, referencesCleaned: 1, auditId: 1 };
    var clean = {};
    Object.keys(allowed).forEach(function(k) { if (record[k] !== undefined) clean[k] = record[k]; });
    return ensureDir().then(function() {
      return writeFileAtomic(filePath, JSON.stringify(clean, null, 2) + '\n', { encoding: 'utf8' });
    }).then(function() { logger.info('Tombstone written: ' + record.assetId); });
  }

  function read(assetId) {
    return fsp.readFile(path.join(tombstoneDir, assetId + '.json'), 'utf8').then(function(text) {
      return JSON.parse(text);
    }).catch(function(err) { if (err.code === 'ENOENT') return null; throw err; });
  }

  function list() {
    return fsp.readdir(tombstoneDir).then(function(files) {
      return files.filter(function(f) { return f.endsWith('.json'); }).map(function(f) { return f.slice(0, -5); });
    }).catch(function(err) { if (err.code === 'ENOENT') return []; throw err; });
  }

  return { write, read, list };
}

module.exports = { TombstoneStore: TombstoneStore };
