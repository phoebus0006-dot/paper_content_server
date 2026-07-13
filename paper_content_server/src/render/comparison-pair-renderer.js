// comparison-pair-renderer.js — Comparison Pair 布局渲染器
// 将两个内容项渲染为对比布局(左右分屏),输出真实 EPF1 二进制帧。
var epf1 = require('../epaper/epf1');
var palette = require('../epaper/palette');
var frameValidator = require('../epaper/frame-validator');
var textRasterizer = require('./text-rasterizer');
var imageRasterizer = require('./image-rasterizer');

var CANVAS_WIDTH = epf1.EPF1_CONSTANTS.WIDTH;
var CANVAS_HEIGHT = epf1.EPF1_CONSTANTS.HEIGHT;
var TOTAL_PIXELS = CANVAS_WIDTH * CANVAS_HEIGHT;

function renderComparisonPair(content, options) {
  if (!content || !Array.isArray(content.items) || content.items.length < 2) return null;
  options = options || {};
  var width = options.width || 800;
  var height = options.height || 480;
  var clock = options.clock;

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
    publishedAt: content.publishedAt || (clock != null ? String(clock) : ''),
    layout: {
      leftTitleY: 20,
      rightTitleY: 20,
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

// 把对比布局光栅化为 384000 个调色板码(含真实文字像素)。
// 返回 Promise<codes>,因为 CJK 文字光栅化是异步的(sharp SVG text)。
function rasterizeComparisonPair(pair) {
  if (!pair) return Promise.resolve(null);
  var codes = newCanvas(1);
  var half = Math.floor(CANVAS_WIDTH / 2); // 400

  // 左半部分边框 (code 3) + 标题条带
  drawHLine(codes, 8, half - 8, 8, 3, 2);
  drawHLine(codes, 8, half - 8, CANVAS_HEIGHT - 8, 3, 2);
  drawVLine(codes, 8, 8, CANVAS_HEIGHT - 8, 3, 2);
  drawVLine(codes, half - 8, 8, CANVAS_HEIGHT - 8, 3, 2);
  fillRect(codes, 10, 10, half - 10, 80, 3);
  drawHLine(codes, 10, half - 10, 90, 0, 1);

  // 右半部分边框 (code 6) + 标题条带
  drawHLine(codes, half + 8, CANVAS_WIDTH - 8, 8, 6, 2);
  drawHLine(codes, half + 8, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8, 6, 2);
  drawVLine(codes, half + 8, 8, CANVAS_HEIGHT - 8, 6, 2);
  drawVLine(codes, CANVAS_WIDTH - 8, 8, CANVAS_HEIGHT - 8, 6, 2);
  fillRect(codes, half + 10, 10, CANVAS_WIDTH - 10, 80, 6);
  drawHLine(codes, half + 10, CANVAS_WIDTH - 10, 90, 0, 1);

  // 中间分隔线 x=400,全高,黑色,3px 厚
  drawVLine(codes, half - 1, 0, CANVAS_HEIGHT, 0, 3);

  // === 文字内容 ===
  // 所有文字通过 renderTextAsync 渲染,以支持真实 CJK 字形。
  var textTasks = [];
  // 左标题(红色背景上白色文字)
  textTasks.push(textRasterizer.renderTextAsync(pair.left.title || '', 20, 20, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 1, {
    scale: 2, maxWidth: half - 40, maxLines: 2,
  }));
  // 左摘要(白色背景上黑色文字)
  textTasks.push(textRasterizer.renderTextAsync(pair.left.summary || '', 20, 100, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 0, {
    scale: 1, maxWidth: half - 40, maxLines: 6,
  }));

  // 右标题(绿色背景上白色文字)
  textTasks.push(textRasterizer.renderTextAsync(pair.right.title || '', half + 20, 20, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 1, {
    scale: 2, maxWidth: half - 40, maxLines: 2,
  }));
  // 右摘要(白色背景上黑色文字)
  textTasks.push(textRasterizer.renderTextAsync(pair.right.summary || '', half + 20, 100, codes, CANVAS_WIDTH, CANVAS_HEIGHT, 0, {
    scale: 1, maxWidth: half - 40, maxLines: 6,
  }));

  return Promise.all(textTasks).then(function () { return codes; });
}

// 异步光栅化两侧图片(若有 imageUrl)。
function rasterizeImages(pair, codes) {
  var tasks = [];
  var half = Math.floor(CANVAS_WIDTH / 2);
  // 图片区域:摘要下方(y=300 到 y=470,高 170;宽 360;居中)
  var imgW = 360;
  var imgH = 160;
  var imgY = 300;

  if (pair && pair.left && pair.left.imageUrl) {
    tasks.push(imageRasterizer.rasterizeImage(
      pair.left.imageUrl, 20 + Math.floor((half - 40 - imgW) / 2), imgY, imgW, imgH,
      codes, CANVAS_WIDTH, CANVAS_HEIGHT, { mode: 'contain' }
    ));
  }
  if (pair && pair.right && pair.right.imageUrl) {
    tasks.push(imageRasterizer.rasterizeImage(
      pair.right.imageUrl, half + 20 + Math.floor((half - 40 - imgW) / 2), imgY, imgW, imgH,
      codes, CANVAS_WIDTH, CANVAS_HEIGHT, { mode: 'contain' }
    ));
  }
  if (tasks.length === 0) return Promise.resolve(null);
  return Promise.all(tasks).then(function() { return null; });
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
    render: function(content, profileId, clock) {
      var pair = renderComparisonPair(content, { clock: clock });
      if (!pair) return Promise.resolve(null);
      return rasterizeComparisonPair(pair).then(function(codes) {
        if (!codes) return null;
        return rasterizeImages(pair, codes).then(function() {
          var frame;
          try {
            frame = encodeAndValidate(codes);
          } catch (e) {
            throw e;
          }
          var clockValue = (clock !== undefined && clock !== null) ? clock : '0';
          return {
            frame: frame,
            frameId: 'comparison_pair:' + clockValue,
            profileId: profileId || 'default',
            layout: pair,
          };
        });
      });
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
