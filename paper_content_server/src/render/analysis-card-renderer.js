// analysis-card-renderer.js — Analysis Card 布局渲染器
// 将新闻内容渲染为分析卡片格式(标题+摘要+数据点)
function renderAnalysisCard(content, options) {
  if (!content || !content.title) return null;
  options = options || {};
  var width = options.width || 800;
  var height = options.height || 480;

  var card = {
    type: 'analysis_card',
    width: width,
    height: height,
    title: content.title,
    summary: content.summary || content.description || '',
    dataPoints: content.dataPoints || [],
    source: content.source || '',
    publishedAt: content.publishedAt || new Date().toISOString(),
    layout: {
      titleY: 40,
      summaryY: 120,
      dataPointsStartY: 200,
      sourceY: height - 40,
    },
  };

  if (content.items && Array.isArray(content.items)) {
    card.dataPoints = content.items.slice(0, 5).map(function(item, i) {
      return {
        label: item.title || item.label || ('Point ' + (i+1)),
        value: item.value || item.summary || '',
      };
    });
  }

  return card;
}

function createAnalysisCardRenderer() {
  return {
    render: function(content, profileId) {
      var card = renderAnalysisCard(content);
      if (!card) return Promise.resolve(null);
      return Promise.resolve({
        frame: Buffer.from(JSON.stringify(card)),
        frameId: 'analysis_card:' + Date.now().toString(36),
        profileId: profileId || 'default',
      });
    },
    canRender: function(content) {
      return !!(content && content.title && (content.dataPoints || content.items));
    },
  };
}

module.exports = { createAnalysisCardRenderer: createAnalysisCardRenderer, renderAnalysisCard: renderAnalysisCard };
