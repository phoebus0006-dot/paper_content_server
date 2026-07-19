// news-pipeline.js — Async production news pipeline
// Order: normalize → identity → pre-dedup → translate → edit → layout → final dedup → quality → last-good
var { normalizeFeedItems } = require('./news-normalizer');
var { extractArticleIdentity } = require('./article-identity');
var { deduplicate } = require('./news-deduplicator');
var { createTranslationGate } = require('./translation-gate');
var { rewriteTitle, rewriteSummary, evaluateQuality } = require('./news-editor');
var { computeCardLayout } = require('./news-layout');
var { LastGoodStore } = require('./last-good-store');

function createNewsPipeline(config, logger) {
  logger = logger || { info: function() {}, warn: function() {}, error: function() {} };
  var lastGood = LastGoodStore(config.lastGoodFile, logger);
  var translator = createTranslationGate(config.provider, config.apiKey, config.model, config.baseUrl);

  async function run(liveItems) {
    var normalized = normalizeFeedItems(liveItems || []);
    // Identity
    var withIdentity = normalized.map(function(item) {
      var id = extractArticleIdentity(item);
      return Object.assign({}, item, { canonicalUrl: id.canonicalUrl, articleId: id.articleId, normalizedTitle: id.normalizedTitle, eventKey: id.eventKey });
    });
    // Pre-dedup
    var deduped = deduplicate(withIdentity);
    // Translate
    var translated = await Promise.all(deduped.map(async function(item) {
      if (item.language && item.language.startsWith('zh')) {
        item.zhTitle = item.title; item.zhSummary = item.description; item.translationStatus = 'skipped'; item.translationProvider = 'none';
        return item;
      }
      try {
        var tTitle = await translator.translate(item.title, 'zh');
        var tSummary = await translator.translate(item.description, 'zh');
        item.zhTitle = tTitle || item.zhTitle || item.title;
        item.zhSummary = tSummary || item.zhSummary || item.description;
        item.translationStatus = tTitle ? 'completed' : 'pending';
        item.translationProvider = translator.provider || 'none';
      } catch(e) { item.translationStatus = 'failed'; item.translationFailureReason = e.message; }
      return item;
    }));
    // Edit
    var edited = translated.map(function(item) {
      item.zhTitle = rewriteTitle(item.zhTitle || item.title);
      item.zhSummary = rewriteSummary(item.zhSummary || item.description);
      item.qualityResult = evaluateQuality(item);
      return item;
    });
    // Final dedup
    var final = deduplicate(edited);
    // Layout
    var layout = computeCardLayout(final.length);
    var result = { items: final, layout: layout, count: final.length, translationProvider: translator.provider };

    // Last-good decision
    if (final.length >= 6) {
      result.lastGoodAction = 'saved';
      try { await lastGood.save({ items: final, version: 1, updatedAt: new Date().toISOString(), translationProvider: translator.provider }); } catch(e) { logger.warn('last-good save failed: ' + e.message); }
    } else if (final.length === 0) {
      result.lastGoodAction = 'fallback';
      // lastGood.load() 包裹 try/catch：readOrNull 只吞 NOT_FOUND，JSON 损坏会 reject
      // INVALID_JSON，让整条 pipeline reject 连原始 final 结果都丢弃（与 save 的容错不一致）。
      try {
        var lg = await lastGood.load();
        if (lg && lg.items && lg.items.length >= 6) { result.items = lg.items; result.count = lg.items.length; result.layout = computeCardLayout(lg.items.length); }
      } catch(e) { logger.warn('last-good load failed (fallback): ' + e.message); }
    } else {
      result.lastGoodAction = 'insufficient_no_overwrite';
      try {
        var lg2 = await lastGood.load();
        if (lg2 && lg2.items && lg2.items.length >= 6) { result.items = lg2.items; result.count = lg2.items.length; result.layout = computeCardLayout(lg2.items.length); }
      } catch(e) { logger.warn('last-good load failed (insufficient): ' + e.message); }
    }
    return result;
  }

  return { run: run, lastGood: lastGood };
}
module.exports = { createNewsPipeline: createNewsPipeline };