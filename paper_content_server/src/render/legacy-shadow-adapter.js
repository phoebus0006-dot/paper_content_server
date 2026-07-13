// legacy-shadow-adapter.js — Legacy shadow pipeline (direct color-block render)
//
// This is the OLD rendering approach used as the shadow comparison side in the
// meaningful render shadow. It rasterizes content into an EPF1 frame using
// ONLY direct color-block fills — it does NOT use the text-rasterizer. The
// resulting frame therefore carries the layout's background regions but no
// real text pixels, which is a genuinely different implementation from the
// orchestrator shadow adapter (which renders text via text-rasterizer).
//
// Input:  (normalizedContent, profileId, clock)
// Output: { frame, frameId, layoutType }  (frame is a real EPF1 Buffer)
//
// The adapter intentionally mirrors the layout-type selection used by the
// orchestrator pipeline (analysis -> comparison -> sequence) so that both
// sides pick the SAME layout type for a given input, isolating the difference
// to the rasterization implementation itself.
var epf1 = require('../epaper/epf1');
var palette = require('../epaper/palette');
var frameValidator = require('../epaper/frame-validator');

var CANVAS_WIDTH = epf1.EPF1_CONSTANTS.WIDTH;
var CANVAS_HEIGHT = epf1.EPF1_CONSTANTS.HEIGHT;
var TOTAL_PIXELS = CANVAS_WIDTH * CANVAS_HEIGHT;

// --- direct color-block rasterizer helpers (no text-rasterizer) ---
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

// Layout selection mirrors the orchestrator pipeline so both sides agree on
// the layout type for the same input.
function detectLayoutType(content) {
  if (!content) return null;
  if (content.title && (content.dataPoints || content.items)) return 'analysis_card';
  if (Array.isArray(content.items) && content.items.length >= 4) return 'sequence_2x2';
  if (Array.isArray(content.items) && content.items.length >= 2) return 'comparison_pair';
  return null;
}

// Legacy analysis card: background regions only (no text, no per-item markers).
function rasterizeLegacyAnalysis(content) {
  var codes = newCanvas(1); // white background
  fillRect(codes, 0, 0, CANVAS_WIDTH, 80, 5);    // blue title bar
  drawHLine(codes, 0, CANVAS_WIDTH, 80, 0, 2);   // title divider
  drawHLine(codes, 0, CANVAS_WIDTH, 200, 0, 2);  // summary divider
  fillRect(codes, 0, 202, CANVAS_WIDTH, 440, 2); // yellow data region
  drawHLine(codes, 0, CANVAS_WIDTH, 440, 0, 2);  // data divider
  fillRect(codes, 0, 442, CANVAS_WIDTH, CANVAS_HEIGHT, 0); // black source bar
  return codes;
}

// Legacy comparison pair: left/right color halves + divider (no text).
function rasterizeLegacyComparison(content) {
  var codes = newCanvas(1);
  var half = Math.floor(CANVAS_WIDTH / 2);
  fillRect(codes, 0, 0, half, CANVAS_HEIGHT, 3);            // left red
  fillRect(codes, half, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 6); // right green
  drawVLine(codes, half - 1, 0, CANVAS_HEIGHT, 0, 3);       // center divider
  return codes;
}

// Legacy sequence 2x2: four color quadrants + grid lines (no text).
function rasterizeLegacySequence(content) {
  var codes = newCanvas(1);
  var half = Math.floor(CANVAS_WIDTH / 2);
  var midY = Math.floor(CANVAS_HEIGHT / 2);
  fillRect(codes, 0, 0, half, midY, 3);                   // TL red
  fillRect(codes, half, 0, CANVAS_WIDTH, midY, 2);        // TR yellow
  fillRect(codes, 0, midY, half, CANVAS_HEIGHT, 5);       // BL blue
  fillRect(codes, half, midY, CANVAS_WIDTH, CANVAS_HEIGHT, 6); // BR green
  drawVLine(codes, half - 1, 0, CANVAS_HEIGHT, 0, 3);
  drawHLine(codes, 0, CANVAS_WIDTH, midY - 1, 0, 3);
  return codes;
}

function encodeAndValidate(codes) {
  var frame = epf1.encodeFrame(codes);
  var v = frameValidator.validateFrameBuffer(frame);
  if (!v.ok) {
    throw new Error('EPF1 validation failed: ' + v.errors.join('; '));
  }
  return frame;
}

function createLegacyShadowAdapter() {
  return {
    // Identifies the module so tests can verify legacy and orchestrator come
    // from genuinely different modules (IMPLEMENTATIONS_DIFFERENT).
    name: 'legacy-shadow-adapter',
    source: 'legacy-shadow-adapter.js',
    render: function (normalizedContent, profileId, clock) {
      var layoutType = detectLayoutType(normalizedContent);
      if (!layoutType) return Promise.resolve(null);
      var codes;
      try {
        if (layoutType === 'analysis_card') {
          codes = rasterizeLegacyAnalysis(normalizedContent);
        } else if (layoutType === 'comparison_pair') {
          codes = rasterizeLegacyComparison(normalizedContent);
        } else if (layoutType === 'sequence_2x2') {
          codes = rasterizeLegacySequence(normalizedContent);
        } else {
          return Promise.resolve(null);
        }
        var frame = encodeAndValidate(codes);
      } catch (e) {
        return Promise.reject(e);
      }
      var clockValue = (clock !== undefined && clock !== null) ? clock : '0';
      return Promise.resolve({
        frame: frame,
        frameId: 'legacy:' + layoutType + ':' + clockValue,
        layoutType: layoutType,
      });
    },
  };
}

module.exports = {
  createLegacyShadowAdapter: createLegacyShadowAdapter,
  detectLayoutType: detectLayoutType,
};
