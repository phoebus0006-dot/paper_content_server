// news-layout.js — News layout computation (header, footer, card layout)
var NEWS_LAYOUT = { HEADER_HEIGHT: 38, FOOTER_HEIGHT: 18, CARD_HEIGHT: 60, CARD_GAP: 2, MAX_VISIBLE_LINES: 3 };

function computeCardLayout(itemCount) {
  return {
    visibleCards: Math.min(itemCount, 6),
    cardHeight: NEWS_LAYOUT.CARD_HEIGHT,
    totalHeight: NEWS_LAYOUT.HEADER_HEIGHT + NEWS_LAYOUT.FOOTER_HEIGHT + Math.min(itemCount, 6) * (NEWS_LAYOUT.CARD_HEIGHT + NEWS_LAYOUT.CARD_GAP),
  };
}

module.exports = { NEWS_LAYOUT, computeCardLayout };
