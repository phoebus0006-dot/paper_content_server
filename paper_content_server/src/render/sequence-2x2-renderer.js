// sequence-2x2-renderer.js — Sequence 2x2 布局渲染器
// 将 4 个内容项渲染为 2x2 网格,输出真实 EPF1 二进制帧。
var epf1 = require('../epaper/epf1');
var palette = require('../epaper/palette');
var frameValidator = require('../epaper/frame-validator');

var CANVAS_WIDTH = epf1.EPF1_CONSTANTS.WIDTH;
var CANVAS_HEIGHT = epf1.EPF1_CONSTANTS.HEIGHT;
var TOTAL_PIXELS = CANVAS_WIDTH * CANVAS_HEIGHT;

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

// 把 2x2 网格布局光栅化为 384000 个调色板码。
function rasterizeSequence2x2(grid) {
  if (!grid) return null;
  // 白色背景
  var codes = newCanvas(1);
  var half = Math.floor(CANVAS_WIDTH / 2);   // 400
  var midY = Math.floor(CANVAS_HEIGHT / 2);  // 240

  // 左上(0-399, 0-239):红色背景 (code 3)
  fillRect(codes, 0, 0, half, midY, 3);
  // 右上(400-799, 0-239):黄色背景 (code 2)
  fillRect(codes, half, 0, CANVAS_WIDTH, midY, 2);
  // 左下(0-399, 240-479):蓝色背景 (code 5)
  fillRect(codes, 0, midY, half, CANVAS_HEIGHT, 5);
  // 右下(400-799, 240-479):绿色背景 (code 6)
  fillRect(codes, half, midY, CANVAS_WIDTH, CANVAS_HEIGHT, 6);

  // 网格线:x=400 全高黑色,3px 厚
  drawVLine(codes, half - 1, 0, CANVAS_HEIGHT, 0, 3);
  // 网格线:y=240 全宽黑色,3px 厚
  drawHLine(codes, 0, CANVAS_WIDTH, midY - 1, 0, 3);

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

function createSequence2x2Renderer() {
  return {
    render: function(content, profileId) {
      var grid = renderSequence2x2(content);
      if (!grid) return Promise.resolve(null);
      try {
        var codes = rasterizeSequence2x2(grid);
        var frame = encodeAndValidate(codes);
        return Promise.resolve({
          frame: frame,
          frameId: 'sequence_2x2:' + Date.now().toString(36),
          profileId: profileId || 'default',
          layout: grid,
        });
      } catch (e) {
        return Promise.reject(e);
      }
    },
    canRender: function(content) {
      return !!(content && Array.isArray(content.items) && content.items.length >= 4);
    },
  };
}

module.exports = {
  createSequence2x2Renderer: createSequence2x2Renderer,
  renderSequence2x2: renderSequence2x2,
  rasterizeSequence2x2: rasterizeSequence2x2,
};
