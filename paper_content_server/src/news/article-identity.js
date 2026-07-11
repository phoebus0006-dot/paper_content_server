// article-identity.js — Canonical article identity for deduplication
var crypto = require('crypto');

function normalizeTitle(title) {
  return String(title || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim().toLowerCase();
}

function createArticleId(url) {
  return 'art_' + crypto.createHash('sha256').update(String(url || '')).digest('hex').slice(0, 16);
}

function extractArticleIdentity(item) {
  var canonicalUrl = item.url || item.sourceUrl || '';
  return {
    canonicalUrl: canonicalUrl,
    articleId: createArticleId(canonicalUrl),
    eventKey: 'PARTIAL',
    normalizedTitle: normalizeTitle(item.title || item.zhTitle || ''),
  };
}

module.exports = { normalizeTitle, createArticleId, extractArticleIdentity };
