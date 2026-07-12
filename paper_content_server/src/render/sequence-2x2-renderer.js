// sequence-2x2-renderer.js — Sequence 2x2 布局渲染器
// 将 4 个内容项渲染为 2x2 网格
function renderSequence2x2(content, options) {
  if (!content || !Array.isArray(content.items) || content.items.length < 4) return null;
  options = options || {};
  var width = options.width || 800;
  var height = options.height || 480;

  var cells = content.items.slice(0, 4).map(function(item, i) {
    var row = Math.floor(i / 2);
    var col = i % 2;
    return {
      index: i,
      row: row,
      col: col,
      title: item.title || '',
      summary: item.summary || item.description || '',
      imageUrl: item.imageUrl || null,
      cellX: col * (width / 2),
      cellY: row * (height / 2),
      cellWidth: width / 2,
      cellHeight: height / 2,
    };
  });

  return {
    type: 'sequence_2x2',
    width: width,
    height: height,
    cells: cells,
    layout: {
      gridRows: 2,
      gridCols: 2,
      cellWidth: width / 2,
      cellHeight: height / 2,
    },
  };
}

function createSequence2x2Renderer() {
  return {
    render: function(content, profileId) {
      var grid = renderSequence2x2(content);
      if (!grid) return Promise.resolve(null);
      return Promise.resolve({
        frame: Buffer.from(JSON.stringify(grid)),
        frameId: 'sequence_2x2:' + Date.now().toString(36),
        profileId: profileId || 'default',
      });
    },
    canRender: function(content) {
      return !!(content && Array.isArray(content.items) && content.items.length >= 4);
    },
  };
}

module.exports = { createSequence2x2Renderer: createSequence2x2Renderer, renderSequence2x2: renderSequence2x2 };
