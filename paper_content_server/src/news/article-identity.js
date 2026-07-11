// article-identity.js — Canonical article identity with empty URL fallback
var crypto = require('crypto');

function normalizeTitle(title) {
  return String(title || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim().toLowerCase();
}

function createArticleId(url) {
  return 'art_' + crypto.createHash('sha256').update(String(url || '')).digest('hex').slice(0, 16);
}

function extractArticleIdentity(item) {
  var canonicalUrl = item.url || item.sourceUrl || '';
  var normalizedTitle = normalizeTitle(item.title || item.zhTitle || '');
  // Empty URL fallback: source + publishedAt + normalizedTitle
  if (!canonicalUrl) {
    var fallbackKey = (item.source || 'unknown') + '|' + (item.publishedAt || '') + '|' + normalizedTitle;
    canonicalUrl = 'fallback://' + crypto.createHash('sha256').update(fallbackKey).digest('hex').slice(0, 16);
  }
  return {
    canonicalUrl: canonicalUrl,
    articleId: createArticleId(canonicalUrl),
    eventKey: 'PARTIAL',
    normalizedTitle: normalizedTitle,
  };
}
module.exports = { normalizeTitle, createArticleId, extractArticleIdentity };