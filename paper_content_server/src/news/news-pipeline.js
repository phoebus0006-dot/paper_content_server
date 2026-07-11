// news-pipeline.js — News pipeline orchestrator
// Order: normalize → translate → dedup → edit → layout → last-good
// Does NOT import server.js or global runtime.

var { normalizeFeedItems } = require('./news-normalizer');
var { extractArticleIdentity } = require('./article-identity');
var { deduplicate } = require('./news-deduplicator');
var { createTranslationGate } = require('./translation-gate');
var { rewriteTitle, rewriteSummary } = require('./news-editor');
var { computeCardLayout } = require('./news-layout');
var { LastGoodStore } = require('./last-good-store');

function createNewsPipeline(config, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };
  var lastGood = LastGoodStore(config.lastGoodFile, logger);

  function process(items) {
    var normalized = normalizeFeedItems(items);
    var deduped = deduplicate(normalized);
    var processed = deduped.map(function(item) {
      return Object.assign({}, item, {
        zhTitle: rewriteTitle(item.zhTitle || item.title),
        zhSummary: rewriteSummary(item.zhSummary || item.description),
      });
    });
    var layout = computeCardLayout(processed.length);
    return {
      items: processed,
      layout: layout,
      count: processed.length,
    };
  }

  return { process: process, lastGood: lastGood };
}

module.exports = { createNewsPipeline: createNewsPipeline };
