/**
 * lib/news-pipeline.js
 * Extracted pure functions for news display content truncation to prevent data loss on raw inputs.
 */

/**
 * Truncates text safely to the nearest sentence boundary within maxLen.
 * Fallback to word boundaries or raw cutoff if no sentence punctuation is found.
 */
function safeTruncateSentences(text, maxLen) {
  if (!text) return '';
  const str = String(text).trim();
  const chars = [...str];
  if (chars.length <= maxLen) return str;

  const sentenceEnds = ['。', '！', '？', '；', '.', '!', '?', ';'];
  
  let lastGoodEnd = -1;
  for (let i = 0; i < maxLen; i++) {
    if (sentenceEnds.includes(chars[i])) {
      lastGoodEnd = i;
    }
  }

  // If a sentence end is found within maxLen, cut there
  if (lastGoodEnd !== -1) {
    return chars.slice(0, lastGoodEnd + 1).join('');
  }

  // Fallback 1: Truncate at comma/space, then append ...
  const softEnds = ['，', '、', ',', ' '];
  let lastSoftEnd = -1;
  for (let i = 0; i < maxLen - 3; i++) {
    if (softEnds.includes(chars[i])) {
      lastSoftEnd = i;
    }
  }

  if (lastSoftEnd !== -1) {
    return chars.slice(0, lastSoftEnd).join('') + '...';
  }

  // Fallback 2: Hard truncate
  return chars.slice(0, maxLen - 3).join('') + '...';
}

/**
 * Builds safe display fields out of raw contents.
 * Leaves article.rawTitle and article.rawContent untouched.
 */
function buildNewsDisplayContent(article, provider = 'default') {
  let displayTitle = '';
  let displaySummary = '';

  const rawTitle = article.rawTitle || article.zhTitle || article.title || '';
  let rawContent = article.rawContent || article.zhSummary || article.summary || '';

  // Clean rawContent specifically for display without mutating raw source
  let cleanContent = String(rawContent).trim();
  
  cleanContent = cleanContent.replace(/\s*\(?(?:Photo|Image|Picture|Credit|Source|AP|Reuters|AFP|Getty|EPA|Bloomberg)[^。)（]*?\)?\.?\s*/g, '');
  cleanContent = cleanContent.replace(/\s*Continue reading\.\.\..*$/gi, '');
  cleanContent = cleanContent.replace(/\s*Sign up for.*?email\s*$/gi, '');
  cleanContent = cleanContent.replace(/\s*Read more\s*$/gi, '');
  cleanContent = cleanContent.replace(/\s*This article was.*?\.\s*$/gi, '');
  cleanContent = cleanContent.replace(/^.*?\d{1,2}\s*月\s*\d{1,2}\s*日\s*.*?(消息|报道|讯)[，。、]?\s*/g, '');
  cleanContent = cleanContent.replace(/^\d{1,2}\s*月\s*\d{1,2}\s*日[，,]\s*/g, '');
  cleanContent = cleanContent.replace(/^[\u4e00-\u9fff\w]+?(?:获悉|讯)[，,:]\s*/g, '');
  cleanContent = cleanContent.replace(/^据[\u4e00-\u9fff]*?\d{1,2}月\d{1,2}日[报道称]+\s*/g, '');
  cleanContent = cleanContent.replace(/本文约\d+字.*?$/gm, '');
  cleanContent = cleanContent.replace(/建议阅读[^。]*。/g, '');
  cleanContent = cleanContent.replace(/[（(]\s*作者[：:][^)）]+[)）]/g, '');
  cleanContent = cleanContent.replace(/[（(]\s*编辑[：:][^)）]+[)）]/g, '');
  cleanContent = cleanContent.replace(/图源[：:][^。]*。/g, '');
  cleanContent = cleanContent.replace(/^[-–—|•\s]+/g, '').trim();
  cleanContent = cleanContent.replace(/\s{2,}/g, ' ').trim();

  let cleanTitle = String(rawTitle).trim();
  if (!cleanTitle) cleanTitle = '新闻';

  // Apply truncation based on device constraints
  displayTitle = safeTruncateSentences(cleanTitle, 40); // Titles shouldn't be too long
  if (!displayTitle.endsWith('...') && displayTitle.length < cleanTitle.length) {
      displayTitle += '...'; // It got truncated hard
  }

  displaySummary = safeTruncateSentences(cleanContent, 75);
  
  // Ensure we don't have dangling periods and ellipses
  if (displaySummary && !/[。！？.!?]$/.test(displaySummary) && !displaySummary.endsWith('...')) {
    displaySummary += '。';
  }

  return {
    rawTitle: String(rawTitle),
    rawContent: String(rawContent),
    displayTitle,
    displaySummary
  };
}

module.exports = {
  safeTruncateSentences,
  buildNewsDisplayContent
};
