// comparison-pair-renderer.js — Comparison Pair 布局渲染器
// 将两个内容项渲染为对比布局(左右分屏),输出真实 EPF1 二进制帧。
var epf1 = require('../epaper/epf1');
var palette = require('../epaper/palette');
var frameValidator = require('../epaper/frame-validator');

var CANVAS_WIDTH = epf1.EPF1_CONSTANTS.WIDTH;
var CANVAS_HEIGHT = epf1.EPF1_CONSTANTS.HEIGHT;
var TOTAL_PIXELS = CANVAS_WIDTH * CANVAS_HEIGHT;

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

// --- Rasterizer helpers ---
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

// 把对比布局光栅化为 384000 个调色板码。
function rasterizeComparisonPair(pair) {
  if (!pair) return null;
  // 白色背景
  var codes = newCanvas(1);
  var half = Math.floor(CANVAS_WIDTH / 2); // 400

  // 左半部分(0-399):标题区+摘要区,红色边框 (code 3)
  // 左侧内容区域边框(矩形)
  drawHLine(codes, 8, half - 8, 8, 3, 2);          // 顶边
  drawHLine(codes, 8, half - 8, CANVAS_HEIGHT - 8, 3, 2); // 底边
  drawVLine(codes, 8, 8, CANVAS_HEIGHT - 8, 3, 2); // 左边
  drawVLine(codes, half - 8, 8, CANVAS_HEIGHT - 8, 3, 2); // 右边(靠近分隔线)
  // 左标题区背景(上部 10-80):浅色区分(红色填充作为标题条带)
  fillRect(codes, 10, 10, half - 10, 80, 3);
  // 左摘要区分隔线
  drawHLine(codes, 10, half - 10, 90, 0, 1);

  // 右半部分(400-799):标题区+摘要区,绿色边框 (code 6)
  drawHLine(codes, half + 8, CANVAS_WIDTH - 8, 8, 6, 2);
  drawHLine(codes, half + 8, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8, 6, 2);
  drawVLine(codes, half + 8, 8, CANVAS_HEIGHT - 8, 6, 2);
  drawVLine(codes, CANVAS_WIDTH - 8, 8, CANVAS_HEIGHT - 8, 6, 2);
  // 右标题区背景(上部):绿色填充作为标题条带
  fillRect(codes, half + 10, 10, CANVAS_WIDTH - 10, 80, 6);
  // 右摘要区分隔线
  drawHLine(codes, half + 10, CANVAS_WIDTH - 10, 90, 0, 1);

  // 中间分隔线 x=400,全高,黑色 (code 0),3px 厚
  drawVLine(codes, half - 1, 0, CANVAS_HEIGHT, 0, 3);

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

function createComparisonPairRenderer() {
  return {
    render: function(content, profileId) {
      var pair = renderComparisonPair(content);
      if (!pair) return Promise.resolve(null);
      try {
        var codes = rasterizeComparisonPair(pair);
        var frame = encodeAndValidate(codes);
        return Promise.resolve({
          frame: frame,
          frameId: 'comparison_pair:' + Date.now().toString(36),
          profileId: profileId || 'default',
          layout: pair,
        });
      } catch (e) {
        return Promise.reject(e);
      }
    },
    canRender: function(content) {
      return !!(content && Array.isArray(content.items) && content.items.length >= 2);
    },
  };
}

module.exports = {
  createComparisonPairRenderer: createComparisonPairRenderer,
  renderComparisonPair: renderComparisonPair,
  rasterizeComparisonPair: rasterizeComparisonPair,
};
