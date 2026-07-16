const fs = require('fs');

let code = fs.readFileSync('server.js', 'utf8');

// Replace the functions with versions that use our extracted logic
const pipelineMod = `
const { buildNewsDisplayContent } = require('./lib/news-pipeline');

function rewriteNewsTitle(article) {
  return buildNewsDisplayContent(article).displayTitle;
}

function rewriteNewsSummary(article) {
  return buildNewsDisplayContent(article).displaySummary;
}

function evaluateNewsItemQuality(item) {`;

code = code.replace(/function rewriteNewsTitle\(article\) \{[\s\S]*?function evaluateNewsItemQuality\(item\) \{/, pipelineMod);

// Modify where cached snapshots are stored to keep rawTitle and rawContent
const mapItemsReplacement = `
        originalTitle: item.originalTitle,
        originalSummary: item.originalSummary,
        rawTitle: item.rawTitle || item.originalTitle || item.title || '',
        rawContent: item.rawContent || item.originalSummary || item.summary || '',
        zhTitle: rewriteNewsTitle(item),
        zhSummary: rewriteNewsSummary(item),`;

code = code.replace(/originalTitle: item\.originalTitle,[\s\S]*?zhSummary: rewriteNewsSummary\(item\),/g, mapItemsReplacement);

fs.writeFileSync('server.js', code);
console.log('Patched server.js');
