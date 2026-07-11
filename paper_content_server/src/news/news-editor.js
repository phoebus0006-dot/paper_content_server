// news-editor.js — Edit/rewrite news and evaluate quality

function rewriteTitle(title) { return String(title || '').trim(); }
function rewriteSummary(summary) { return String(summary || '').trim(); }

function evaluateQuality(item) {
  var title = item.zhTitle || item.title || '';
  var summary = item.zhSummary || item.description || '';
  var tLen = title.length, sLen = summary.length;
  var ok = tLen > 0 && sLen > 0;
  return { ok: ok, titleLen: tLen, summaryLen: sLen, reasons: ok ? [] : ['EMPTY_TITLE_OR_SUMMARY'] };
}
module.exports = { rewriteTitle, rewriteSummary, evaluateQuality };