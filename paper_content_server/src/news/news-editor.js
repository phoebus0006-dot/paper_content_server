// news-editor.js — Edit/rewrite news titles and summaries
// Mirrors rewriteNewsTitle/rewriteNewsSummary from server.js without changing rules.

function rewriteTitle(title) {
  return String(title || '').trim();
}

function rewriteSummary(summary) {
  return String(summary || '').trim();
}

module.exports = { rewriteTitle, rewriteSummary };
