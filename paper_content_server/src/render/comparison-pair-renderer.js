// comparison-pair-renderer.js — Comparison Pair 布局渲染器
// 将两个内容项渲染为对比布局(左右分屏)
function renderComparisonPair(content, options) {
  if (!content || !Array.isArray(content.items) || content.items.length < 2) return null;
  options = options || {};
  var width = options.width || 800;
  var height = options.height || 480;

  var left = content.items[0];
  var right = content.items[1];

  return {
    type: 'comparison_pair',
    width: width,
    height: height,
    left: {
      title: left.title || '',
      summary: left.summary || left.description || '',
      imageUrl: left.imageUrl || null,
    },
    right: {
      title: right.title || '',
      summary: right.summary || right.description || '',
      imageUrl: right.imageUrl || null,
    },
    dividerX: width / 2,
    layout: {
      leftTitleY: 40,
      rightTitleY: 40,
      leftSummaryY: 100,
      rightSummaryY: 100,
      dividerX: width / 2,
    },
  };
}

function createComparisonPairRenderer() {
  return {
    render: function(content, profileId) {
      var pair = renderComparisonPair(content);
      if (!pair) return Promise.resolve(null);
      return Promise.resolve({
        frame: Buffer.from(JSON.stringify(pair)),
        frameId: 'comparison_pair:' + Date.now().toString(36),
        profileId: profileId || 'default',
      });
    },
    canRender: function(content) {
      return !!(content && Array.isArray(content.items) && content.items.length >= 2);
    },
  };
}

module.exports = { createComparisonPairRenderer: createComparisonPairRenderer, renderComparisonPair: renderComparisonPair };
