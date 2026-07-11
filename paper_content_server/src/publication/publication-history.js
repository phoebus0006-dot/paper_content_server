// publication-history.js — Append-only publication history log
// Stores entries as a JSON array: newest entry first, capped at 100.

var path = require('path');
var JsonStore = require(path.join(__dirname, '..', 'infra', 'json-store')).JsonStore;

var SCHEMA_VERSION = 1;
var MAX_ENTRIES = 100;

function PublicationHistory(historyFile, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };
  var store = JsonStore(historyFile, { schemaVersion: SCHEMA_VERSION });

  function append(entry) {
    return store.readOrDefault({ entries: [], schemaVersion: SCHEMA_VERSION }).then(function(data) {
      data.entries.unshift(entry);
      if (data.entries.length > MAX_ENTRIES) data.entries.length = MAX_ENTRIES;
      data.schemaVersion = SCHEMA_VERSION;
      return store.write(data);
    }).then(function() {
      logger.info('History appended: ' + entry.frameId + ' [' + entry.type + ']');
    });
  }

  function list() {
    return store.readOrDefault({ entries: [], schemaVersion: SCHEMA_VERSION }).then(function(data) {
      return data.entries;
    });
  }

  function clear() {
    return store.write({ entries: [], schemaVersion: SCHEMA_VERSION });
  }

  function latest() {
    return list().then(function(entries) {
      return entries.length > 0 ? entries[0] : null;
    });
  }

  return {
    append: append,
    list: list,
    clear: clear,
    latest: latest,
  };
}

module.exports = { PublicationHistory: PublicationHistory, MAX_ENTRIES: MAX_ENTRIES };
