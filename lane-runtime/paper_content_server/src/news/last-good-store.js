// last-good-store.js — Persist and retrieve last-good news using R1 JsonStore
var path = require('path');
var JsonStore = require(path.join(__dirname, '..', 'infra', 'json-store')).JsonStore;

function LastGoodStore(storeFile, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };
  var store = JsonStore(storeFile);

  function save(news) {
    return store.write(news).then(function() {
      logger.info('last-good-news saved');
    });
  }

  function load() {
    return store.readOrNull();
  }

  function clear() {
    return store.write({ version: 1, items: [], updatedAt: null });
  }

  return { save: save, load: load, clear: clear };
}

module.exports = { LastGoodStore: LastGoodStore };
