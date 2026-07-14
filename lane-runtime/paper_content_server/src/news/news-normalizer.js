// news-normalizer.js — Normalize raw news items to internal format
// Does not change business rules.

function normalizeRawItem(item) {
  if (!item) return null;
  return {
    url: item.url || '',
    title: item.title || '',
    description: item.description || '',
    source: item.source || '',
    category: item.category || 'general',
    language: item.language || 'en',
    publishedAt: item.publishedAt || new Date().toISOString(),
    originalTitle: item.title || '',
    originalSummary: item.description || '',
    zhTitle: '',
    zhSummary: '',
    translationStatus: 'pending',
    sourceUrl: item.url || '',
  };
}

function normalizeFeedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeRawItem).filter(Boolean);
}

module.exports = { normalizeRawItem, normalizeFeedItems };
