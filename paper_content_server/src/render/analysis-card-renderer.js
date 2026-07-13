// analysis-card-renderer.js — Analysis Card 布局渲染器
// 将新闻内容渲染为分析卡片格式(标题+摘要+数据点),输出真实 EPF1 二进制帧。
var epf1 = require('../epaper/epf1');
var palette = require('../epaper/palette');
var frameValidator = require('../epaper/frame-validator');

var CANVAS_WIDTH = epf1.EPF1_CONSTANTS.WIDTH;
var CANVAS_HEIGHT = epf1.EPF1_CONSTANTS.HEIGHT;
var TOTAL_PIXELS = CANVAS_WIDTH * CANVAS_HEIGHT;

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

// --- Rasterizer helpers (inlined, EPF1 codes only: 0,1,2,3,5,6) ---
function newCanvas(fillCode) {
  palette.assertAllowedCode(fillCode);
  var codes = new Array(TOTAL_PIXELS);
  for (var i = 0; i < TOTAL_PIXELS; i++) codes[i] = fillCode;
  return codes;
}

function fillRect(codes, x0, y0, x1, y1, code) {
  palette.assertAllowedCode(code);
  var maxX = Math.min(x1, CANVAS_WIDTH);
  var maxY = Math.min(y1, CANVAS_HEIGHT);
  for (var y = Math.max(0, y0); y < maxY; y++) {
    for (var x = Math.max(0, x0); x < maxX; x++) {
      codes[y * CANVAS_WIDTH + x] = code;
    }
  }
}

function drawHLine(codes, x0, x1, y, code, thickness) {
  palette.assertAllowedCode(code);
  thickness = thickness || 1;
  for (var t = 0; t < thickness; t++) {
    var yy = y + t;
    if (yy < 0 || yy >= CANVAS_HEIGHT) continue;
    var s = Math.max(0, x0);
    var e = Math.min(CANVAS_WIDTH, x1);
    for (var x = s; x < e; x++) codes[yy * CANVAS_WIDTH + x] = code;
  }
}

function drawVLine(codes, x, y0, y1, code, thickness) {
  palette.assertAllowedCode(code);
  thickness = thickness || 1;
  for (var t = 0; t < thickness; t++) {
    var xx = x + t;
    if (xx < 0 || xx >= CANVAS_WIDTH) continue;
    var s = Math.max(0, y0);
    var e = Math.min(CANVAS_HEIGHT, y1);
    for (var y = s; y < e; y++) codes[y * CANVAS_WIDTH + xx] = code;
  }
}

// 把分析卡片布局光栅化为 384000 个调色板码。
function rasterizeAnalysisCard(card) {
  if (!card) return null;
  // 白色背景
  var codes = newCanvas(1);

  // 标题区(上部 0-80):蓝色背景 (code 5)
  fillRect(codes, 0, 0, CANVAS_WIDTH, 80, 5);
  // 标题区分隔线
  drawHLine(codes, 0, CANVAS_WIDTH, 80, 0, 2);

  // 摘要区(中部 82-200):白色背景(已是白色),绘制左右边框
  // 保留白色,在摘要区底部画分隔线
  drawHLine(codes, 0, CANVAS_WIDTH, 200, 0, 2);

  // 数据点区(下部 202-440):黄色背景 (code 2)
  fillRect(codes, 0, 202, CANVAS_WIDTH, 440, 2);
  // 为每个数据点绘制一行标记(左侧色块 + 行分隔线)
  var dataPoints = card.dataPoints || [];
  var regionH = 440 - 202;
  var rowH = dataPoints.length > 0 ? Math.floor(regionH / dataPoints.length) : regionH;
  for (var i = 0; i < dataPoints.length; i++) {
    var rowY = 202 + i * rowH;
    // 左侧标记色块(交替红/绿以区分行)
    var markerCode = (i % 2 === 0) ? 3 : 6; // red / green
    fillRect(codes, 4, rowY + 4, 28, rowY + rowH - 4, markerCode);
    // 行底分隔线(最后一行除外)
    if (i < dataPoints.length - 1) {
      drawHLine(codes, 0, CANVAS_WIDTH, rowY + rowH, 0, 1);
    }
  }
  // 数据点区底部分隔线
  drawHLine(codes, 0, CANVAS_WIDTH, 440, 0, 2);

  // 来源区(底部 442-480):黑色背景 (code 0)
  fillRect(codes, 0, 442, CANVAS_WIDTH, CANVAS_HEIGHT, 0);

  return codes;
}

function encodeAndValidate(codes) {
  if (!codes) return null;
  var frame = epf1.encodeFrame(codes);
  var v = frameValidator.validateFrameBuffer(frame);
  if (!v.ok) {
    throw new Error('EPF1 validation failed: ' + v.errors.join('; '));
  }
  return frame;
}

function createAnalysisCardRenderer() {
  return {
    render: function(content, profileId) {
      var card = renderAnalysisCard(content);
      if (!card) return Promise.resolve(null);
      try {
        var codes = rasterizeAnalysisCard(card);
        var frame = encodeAndValidate(codes);
        return Promise.resolve({
          frame: frame,
          frameId: 'analysis_card:' + Date.now().toString(36),
          profileId: profileId || 'default',
          layout: card,
        });
      } catch (e) {
        return Promise.reject(e);
      }
    },
    canRender: function(content) {
      return !!(content && content.title && (content.dataPoints || content.items));
    },
  };
}

module.exports = {
  createAnalysisCardRenderer: createAnalysisCardRenderer,
  renderAnalysisCard: renderAnalysisCard,
  rasterizeAnalysisCard: rasterizeAnalysisCard,
};
