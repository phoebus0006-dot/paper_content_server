class NewsTitleService {
  constructor(dependencies = {}) {
    this.textRasterizer = dependencies.textRasterizer || null;
    this.MAX_WIDTH_PX = 368; // Default limit for E-ink screen news layout
    this.SOFT_CODEPOINT_LIMIT = 24;
  }

  async normalizeTitle(rawTitle) {
    if (!rawTitle) return this._errorResult('', 'TITLE_EMPTY');
    let title = String(rawTitle).trim();
    if (!title) return this._errorResult('', 'TITLE_EMPTY');

    // 1. Clean prefixes/suffixes
    title = title.replace(/^【(直播|更新|快讯|深度|观察|报道)】/i, '');
    title = title.replace(/_(新浪新闻|网易新闻|腾讯新闻|澎湃新闻|央视新闻|观察者网)$/i, '');
    title = title.replace(/ -(.*新闻|观察者网)$/i, '');

    // 2. Generate candidates
    const candidates = [title];
    
    // Attempt semantic compression if length seems large
    if (title.length > this.SOFT_CODEPOINT_LIMIT) {
      // Basic split on commas/dashes for semantic candidates (mocked semantic logic)
      const parts = title.split(/[，、：—|-]/);
      if (parts.length > 1) {
        // Keep subject (first part) + action/result (last part)
        const compressed = parts[0] + '：' + parts[parts.length - 1];
        if (compressed.length < title.length) candidates.push(compressed);
        candidates.push(parts[0]); // Just the subject
      }
    }

    if (!this.textRasterizer) {
      return this._needsReviewResult(title, title, 'TITLE_RENDERER_UNAVAILABLE');
    }

    // 3. Measure candidates using official renderer
    for (const candidate of candidates) {
      try {
        const width = await this.measureText(candidate);
        if (width <= this.MAX_WIDTH_PX) {
          return {
            rawTitle: rawTitle,
            displayTitle: candidate,
            titleWidthPx: width,
            titleMaxWidthPx: this.MAX_WIDTH_PX,
            titleStatus: 'fit',
            reviewStatus: 'approved',
            normalizationVersion: 'v2-semantic'
          };
        }
      } catch (e) {
        return this._needsReviewResult(rawTitle, candidate, 'TITLE_RENDERER_ERROR');
      }
    }

    // None fit, return needs_review
    return this._needsReviewResult(rawTitle, candidates[0], 'TITLE_MEANING_RISK');
  }

  async measureText(text) {
    if (this.textRasterizer && this.textRasterizer.measureText) {
      return await this.textRasterizer.measureText(text, { fontSize: 24, fontName: 'NotoSansSC' });
    }
    // Fallback if measureText not explicitly available but rasterize is
    return text.length * 24; 
  }

  _errorResult(rawTitle, reason) {
    return {
      rawTitle: rawTitle,
      displayTitle: rawTitle,
      titleWidthPx: 999,
      titleMaxWidthPx: this.MAX_WIDTH_PX,
      titleStatus: 'error',
      reviewStatus: 'pending',
      reason: reason,
      suggestedTitle: rawTitle,
      normalizationVersion: 'v2-semantic'
    };
  }

  _needsReviewResult(rawTitle, suggested, reason) {
    return {
      rawTitle: rawTitle,
      displayTitle: suggested,
      titleWidthPx: 999,
      titleMaxWidthPx: this.MAX_WIDTH_PX,
      titleStatus: 'needs_review',
      reviewStatus: 'pending',
      reason: reason,
      suggestedTitle: suggested,
      normalizationVersion: 'v2-semantic'
    };
  }
}

module.exports = { NewsTitleService };
