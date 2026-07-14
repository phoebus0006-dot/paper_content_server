// news-deduplicator.js — Dedup news items by article identity
var { extractArticleIdentity } = require('./article-identity');

function deduplicate(items) {
  if (!Array.isArray(items)) return [];
  var seen = new Map();
  return items.filter(function(item) {
    var id = extractArticleIdentity(item);
    var key = id.articleId;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

module.exports = { deduplicate };
