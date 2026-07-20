// title-summarizer.js

const NEWS_TITLE_MAX_CODEPOINTS = 24;
const NEWS_SUMMARY_MAX_CODEPOINTS = 56;

const { measureTextWidth } = require('../render/text-rasterizer');

function measureTextWidthPixels(text, fontSize) {
  return measureTextWidth(text, fontSize);
}

function generateCandidates(rawTitle) {
  let candidates = [rawTitle];
  let title = rawTitle;
  
  // 1. Remove redundancy (live, updates, source suffixes)
  const toRemove = [
    /^【[^】]+】/g,          // e.g. 【最新】
    /^最新消息[:：]?\s*/g,
    /^直播[:：]?\s*/g,
    /^更新[:：]?\s*/g,
    /[-_—]\s*[^-_—]+网$/g,   // e.g. - 新华网
    /[-_—]\s*[^-_—]+报$/g    // e.g. - 某某报
  ];
  
  let cleaned = title;
  for (const regex of toRemove) {
    cleaned = cleaned.replace(regex, '');
  }
  cleaned = cleaned.trim();
  if (cleaned !== title) candidates.push(cleaned);

  // 2. Try splitting by punctuation, taking the first meaningful clause if it contains subject/action
  // But we must be careful not to lose numbers, negatives, etc.
  const parts = cleaned.split(/[，。！？、：；,\.\!\?\:\;\|]/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    candidates.push(parts[0]);
    candidates.push(parts.slice(0, 2).join(' ')); // Try first two parts combined briefly
  }
  
  // 3. Remove uninformative adjectives/adverbs (basic heuristic)
  let concise = cleaned
    .replace(/了不起的/g, '')
    .replace(/令人震惊的/g, '')
    .replace(/全面/g, '')
    .replace(/正式/g, '');
  if (concise !== cleaned) candidates.push(concise);

  return [...new Set(candidates)];
}

function summarizeTitle(rawTitle, maxWidthPixels, fontSize) {
  let candidates = generateCandidates(rawTitle);
  
  // Sort candidates by length descending (prefer longer, more informative titles)
  candidates.sort((a, b) => b.length - a.length);
  
  for (const candidate of candidates) {
    let width = measureTextWidthPixels(candidate, fontSize);
    if (width <= maxWidthPixels) {
      return {
        status: 'ok',
        titleStatus: 'fit',
        rawTitle: rawTitle,
        displayTitle: candidate,
        titleWidthPx: width,
        titleMaxWidthPx: maxWidthPixels
      };
    }
  }

  // If no candidate fits, we must force truncate and flag as TITLE_MEANING_RISK
  // We don't just slice(0, 24) or randomly append ... as a success.
  let safeTitle = '';
  let safeWidth = measureTextWidthPixels('...', fontSize);
  for (const char of candidates[candidates.length - 1] || rawTitle) {
    const cw = measureTextWidthPixels(char, fontSize);
    if (safeWidth + cw <= maxWidthPixels) {
      safeTitle += char;
      safeWidth += cw;
    } else {
      break;
    }
  }

  return {
    status: 'needs_review',
    reason: 'TITLE_MEANING_RISK',
    titleStatus: 'needs_review',
    rawTitle: rawTitle,
    displayTitle: safeTitle + '...',
    titleWidthPx: safeWidth, // Approximate
    titleMaxWidthPx: maxWidthPixels
  };
}

module.exports = {
  summarizeTitle,
  measureTextWidthPixels,
  NEWS_TITLE_MAX_CODEPOINTS,
  NEWS_SUMMARY_MAX_CODEPOINTS
};
