class PublicationHistoryAdapter {
  constructor(dependencies = {}) {
    this.rawHistoryFile = dependencies.rawHistoryFile || null;
    this.fs = dependencies.fs || require('fs');
  }

  async readHistory() {
    if (!this.rawHistoryFile || !this.fs.existsSync(this.rawHistoryFile)) {
      return [];
    }
    
    try {
      const raw = JSON.parse(this.fs.readFileSync(this.rawHistoryFile, 'utf8'));
      if (!Array.isArray(raw)) return [];

      return raw.map(item => this.adaptItem(item));
    } catch (e) {
      return [];
    }
  }

  adaptItem(item) {
    if (!item) return null;
    const adapted = { ...item };
    
    // Normalize missing title fields to prevent "无标题"
    if (adapted.type === 'news' && Array.isArray(adapted.news)) {
      adapted.news = adapted.news.map(n => {
        return {
          ...n,
          rawTitle: n.rawTitle || n.title || n.headline || n.displayTitle || '标题字段缺失',
          displayTitle: n.displayTitle || n.rawTitle || n.title || n.headline || '标题字段缺失'
        };
      });
    }

    return adapted;
  }

  async appendHistory(newItem) {
    if (!this.rawHistoryFile) throw new Error('History file not configured');
    
    let history = await this.readHistory();
    // Prepend new item
    history.unshift(newItem);
    
    // Keep max 100 items
    if (history.length > 100) history = history.slice(0, 100);

    this.fs.writeFileSync(this.rawHistoryFile, JSON.stringify(history, null, 2));
    return history;
  }
}

module.exports = { PublicationHistoryAdapter };
