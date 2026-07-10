// json-store.js — JSON persistence with explicit error semantics
// Errors: NOT_FOUND, INVALID_JSON, IO_ERROR

var fsp = require('fs').promises;
var writeFileAtomic = require('./atomic-file').writeFileAtomic;

var ERR_NOT_FOUND = 'NOT_FOUND';
var ERR_INVALID_JSON = 'INVALID_JSON';
var ERR_IO = 'IO_ERROR';

function JsonError(code, message) {
  this.code = code;
  this.message = message;
}

function JsonStore(filePath, options) {
  options = options || {};
  var schemaVersion = options.schemaVersion || 1;

  function read() {
    return fsp.readFile(filePath, 'utf8').then(function(text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        return Promise.reject(new JsonError(ERR_INVALID_JSON, 'JSON parse failed: ' + e.message));
      }
      if (data && data.schemaVersion !== undefined && data.schemaVersion !== schemaVersion) {
        return Promise.reject(new JsonError(ERR_IO, 'Schema version mismatch: expected ' + schemaVersion + ' got ' + data.schemaVersion));
      }
      return data;
    }).catch(function(err) {
      if (err instanceof JsonError) return Promise.reject(err);
      if (err.code === 'ENOENT') return Promise.reject(new JsonError(ERR_NOT_FOUND, 'File not found: ' + filePath));
      return Promise.reject(new JsonError(ERR_IO, String(err.message || err)));
    });
  }

  function readOrNull() {
    return read().catch(function(err) {
      if (err.code === ERR_NOT_FOUND) return null;
      return Promise.reject(err);
    });
  }

  function readOrDefault(defaultValue) {
    return read().catch(function(err) {
      if (err.code === ERR_NOT_FOUND) return defaultValue !== undefined ? defaultValue : null;
      throw err;
    });
  }

  function write(data) {
    var json = JSON.stringify(data, null, 2) + '\n';
    return writeFileAtomic(filePath, json, { encoding: 'utf8' });
  }

  return {
    read: read,
    readOrNull: readOrNull,
    readOrDefault: readOrDefault,
    write: write,
    filePath: filePath,
    schemaVersion: schemaVersion,
  };
}

module.exports = { JsonStore: JsonStore, JsonError: JsonError, ERR_NOT_FOUND: ERR_NOT_FOUND, ERR_INVALID_JSON: ERR_INVALID_JSON, ERR_IO: ERR_IO };
