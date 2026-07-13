// analysis-card-renderer.js — Analysis Card 布局渲染器
// 将新闻内容渲染为分析卡片格式(标题+摘要+数据点),输出真实 EPF1 二进制帧。
var epf1 = require('../epaper/epf1');
var palette = require('../epaper/palette');
var frameValidator = require('../epaper/frame-validator');
var textRasterizer = require('./text-rasterizer');
var imageRasterizer = require('./image-rasterizer');

var CANVAS_WIDTH = epf1.EPF1_CONSTANTS.WIDTH;
var CANVAS_HEIGHT = epf1.EPF1_CONSTANTS.HEIGHT;
var TOTAL_PIXELS = CANVAS_WIDTH * CANVAS_HEIGHT;

function renderAnalysisCard(content, options) {
  if (!content || !content.title) return null;
  options = options || {};
  var width = options.width || 800;
  var height = options.height || 480;
  var clock = options.clock;

  var card = {
    type: 'analysis_card',
    width: width,
    height: height,
    title: content.title,
    summary: content.summary || content.description || '',
    dataPoints: content.dataPoints || [],
    source: content.source || '',
    // Deterministic publishedAt: prefer caller-supplied value, else stringify clock, else blank.
    publishedAt: content.publishedAt || (clock != null ? String(clock) : ''),
    layout: {
      titleY: 20,
      summaryY: 100,
      dataPointsStartY: 210,
      sourceY: height - 30,
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

// 把分析卡片布局光栅化为 384000 个调色板码(含真实文字像素)。
function rasterizeAnalysisCard(card) {
  if (!card) return null;
  // 白色背景
  var codes = newCanvas(1);

  // 标题区(上部 0-80):蓝色背景 (code 5)
  fillRect(codes, 0, 0, CANVAS_WIDTH, 80, 5);
  // 标题区分隔线
  drawHLine(codes, 0, CANVAS_WIDTH, 80, 0, 2);

  // 摘要区(中部 82-200):白色背景(已是白色),绘制左右边框
  drawHLine(codes, 0, CANVAS_WIDTH, 200, 0, 2);

  // 数据点区(下部 202-440):黄色背景 (code 2)
  fillRect(codes, 0, 202, CANVAS_WIDTH, 440, 2);
  var dataPoints = card.dataPoints || [];
  var regionH = 440 - 202;
  var rowH = dataPoints.length > 0 ? Math.floor(regionH / dataPoints.length) : regionH;
  for (var i = 0; i < dataPoints.length; i++) {
    var rowY = 202 + i * rowH;
    var markerCode = (i % 2 === 0) ? 3 : 6;
    fillRect(codes, 4, rowY + 4, 28, rowY + rowH - 4, markerCode);
    if (i < dataPoints.length - 1) {
      drawHLine(codes, 0, CANVAS_WIDTH, rowY + rowH, 0, 1);
    }
  }
  drawHLine(codes, 0, CANVAS_WIDTH, 440, 0, 2);

  // 来源区(底部 442-480):黑色背景 (code 0)
  fillRect(codes, 0, 442, CANVAS_WIDTH, CANVAS_HEIGHT, 0);

  // === 文字内容 ===
  // 标题:蓝色背景上白色文字, scale=2
  textRasterizer.renderText(card.title || '', 20, 20, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 1, {
    scale: 2, maxWidth: CANVAS_WIDTH - 40, maxLines: 2,
  });

  // 摘要:白色背景上黑色文字, scale=1
  textRasterizer.renderText(card.summary || '', 20, 100, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 0, {
    scale: 1, maxWidth: CANVAS_WIDTH - 40, maxLines: 5,
  });

  // 数据点:每个 dataPoint 一行,label: value
  var regionStartY = 210;
  var regionEndY = 435;
  var usableH = regionEndY - regionStartY;
  var rowHeight = dataPoints.length > 0 ? Math.floor(usableH / dataPoints.length) : usableH;
  for (var j = 0; j < dataPoints.length; j++) {
    var dpY = regionStartY + j * rowHeight;
    var dp = dataPoints[j];
    var label = dp.label || ('Point ' + (j + 1));
    var value = dp.value || '';
    var text = label + (value ? ': ' + value : '');
    textRasterizer.renderText(text, 36, dpY + 4, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 0, {
      scale: 1, maxWidth: CANVAS_WIDTH - 60, maxLines: 1,
    });
  }

  // 来源:黑色背景上白色文字
  textRasterizer.renderText(card.source || '', 20, CANVAS_HEIGHT - 30, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 1, {
    scale: 1, maxWidth: CANVAS_WIDTH - 40, maxLines: 1,
  });

  return codes;
}

// 分析卡片不直接绑定图片(按规范);此钩子保留扩展位。
function rasterizeImages(content, codes) {
  if (content && content.imageUrl && typeof content.imageUrl === 'string' && content.imageUrl.length > 0) {
    return imageRasterizer.rasterizeImage(
      content.imageUrl, 20, 210, 200, 200, codes, CANVAS_WIDTH, CANVAS_HEIGHT, { mode: 'contain' }
    );
  }
  return Promise.resolve(null);
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
    render: function(content, profileId, clock) {
      var card = renderAnalysisCard(content, { clock: clock });
      if (!card) return Promise.resolve(null);
      var codes;
      try {
        codes = rasterizeAnalysisCard(card);
      } catch (e) {
        return Promise.reject(e);
      }
      return rasterizeImages(content, codes).then(function() {
        var frame;
        try {
          frame = encodeAndValidate(codes);
        } catch (e) {
          throw e;
        }
        var clockValue = (clock !== undefined && clock !== null) ? clock : '0';
        return {
          frame: frame,
          frameId: 'analysis_card:' + clockValue,
          profileId: profileId || 'default',
          layout: card,
        };
      });
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
