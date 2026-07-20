// title-summarizer.js

const NEWS_TITLE_MAX_CODEPOINTS = 24;
const NEWS_SUMMARY_MAX_CODEPOINTS = 56;

// Estimate pixel width using standard typographic approximations for a typical sans-serif font
function measureTextWidthPixels(text, fontSize) {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code > 255) {
      width += fontSize; // CJK is full width
    } else if (/[A-Z]/.test(char)) {
      width += fontSize * 0.7; // Uppercase Latin
    } else if (/[a-z]/.test(char)) {
      if (/[fijlt]/.test(char)) width += fontSize * 0.3; // Narrow lowercase
      else if (/[mw]/.test(char)) width += fontSize * 0.8; // Wide lowercase
      else width += fontSize * 0.55;
    } else if (/[0-9]/.test(char)) {
      width += fontSize * 0.55;
    } else if (/[.,!?;:|]/.test(char)) {
      width += fontSize * 0.3;
    } else {
      width += fontSize * 0.5; // Default for space, etc.
    }
  }
  return width;
}

function cleanRule1(title) {
  let res = title;
  const toRemove = [
    /最新消息[:：]?\s*/g,
    /据报道[:：]?\s*/g,
    /外媒称[:：]?\s*/g
  ];
  for (const regex of toRemove) {
    res = res.replace(regex, '');
  }
  return res.trim();
}

function summarizeTitle(rawTitle, maxWidthPixels, fontSize) {
  let title = cleanRule1(rawTitle);
  let currentWidth = measureTextWidthPixels(title, fontSize);

  if (currentWidth <= maxWidthPixels) {
    return {
      status: 'ok',
      suggestedTitle: title
    };
  }

  // Semantic truncation: split by punctuation and prioritize main clause.
  const parts = title.split(/[，。！？、：；,\.\!\?\:\;]/).filter(Boolean);
  
  if (parts.length > 1) {
    let candidate = parts[0];
    if (measureTextWidthPixels(candidate, fontSize) <= maxWidthPixels) {
      return {
        status: 'needs_review',
        reason: 'SEMANTIC_TRUNCATED',
        rawTitle: rawTitle,
        suggestedTitle: candidate + '...'
      };
    }
  }

  // If even the first part is too long, or there are no parts, we forcefully truncate 
  // but mark it with "..." and status needs_review
  let safeTitle = '';
  let safeWidth = measureTextWidthPixels('...', fontSize);
  for (const char of title) {
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
    reason: 'FORCE_TRUNCATED',
    rawTitle: rawTitle,
    suggestedTitle: safeTitle + '...'
  };
}

module.exports = {
  summarizeTitle,
  measureTextWidthPixels,
  NEWS_TITLE_MAX_CODEPOINTS,
  NEWS_SUMMARY_MAX_CODEPOINTS
};
