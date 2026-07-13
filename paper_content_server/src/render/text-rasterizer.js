// text-rasterizer.js — Simple bitmap text rasterizer
// Uses an internal 5x7 bitmap font supporting ASCII letters/digits/basic punctuation.
// CJK characters fall back to a placeholder block when no Noto Sans CJK is available.
// The rasterizer writes palette codes directly into a flat codes array (y*width + x).

var fs = require('fs');

// 5x7 bitmap font. Each glyph is an array of 7 strings, each 5 chars wide.
// '1' = pixel on, '0' = pixel off.
var FONT_5x7 = {
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '10001', '01010', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
};

var GLYPH_WIDTH = 5;
var GLYPH_HEIGHT = 7;
var CHAR_ADVANCE = 6;       // 5 wide + 1 gap
var LINE_ADVANCE = 8;       // 7 tall + 1 gap

// CJK font probe: if Noto Sans CJK is installed, we *could* use opentype/freetype,
// but to keep dependencies minimal we always render a placeholder for CJK glyphs.
// This probe exists so callers can introspect whether fallback is active.
var NOTO_CJK_PATH = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
var CJK_FONT_AVAILABLE = false;
try {
  // fs.existsSync on a path that does not exist simply returns false; never throws.
  CJK_FONT_AVAILABLE = fs.existsSync(NOTO_CJK_PATH);
} catch (e) {
  CJK_FONT_AVAILABLE = false;
}

function isCJKChar(ch) {
  var code = ch.charCodeAt(0);
  // CJK Unified Ideographs, common ranges.
  return code > 127 && (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3400 && code <= 0x4DBF) ||
    (code >= 0x3000 && code <= 0x303F) || // CJK punctuation
    (code >= 0xFF00 && code <= 0xFFEF)    // Halfwidth/Fullwidth Forms
  );
}

function isHighCodepoint(ch) {
  // Anything outside ASCII range — we cannot render it from the 5x7 font.
  return ch.charCodeAt(0) > 127;
}

function setPixel(codes, x, y, width, height, colorCode) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  codes[y * width + x] = colorCode;
}

function fillBlock(codes, x0, y0, x1, y1, width, height, colorCode) {
  var maxX = Math.min(x1, width);
  var maxY = Math.min(y1, height);
  for (var y = Math.max(0, y0); y < maxY; y++) {
    for (var x = Math.max(0, x0); x < maxX; x++) {
      codes[y * width + x] = colorCode;
    }
  }
}

// Draw a 5x7 placeholder block for CJK characters (filled outline).
function renderCJKPlaceholder(x, y, codes, width, height, colorCode, scale) {
  scale = scale || 1;
  // Outline box: outer ring + interior dot pattern, so it's visibly not blank.
  for (var row = 0; row < GLYPH_HEIGHT; row++) {
    for (var col = 0; col < GLYPH_WIDTH; col++) {
      var on = (row === 0 || row === GLYPH_HEIGHT - 1 ||
                col === 0 || col === GLYPH_WIDTH - 1 ||
                (row === Math.floor(GLYPH_HEIGHT / 2) && col === Math.floor(GLYPH_WIDTH / 2)));
      if (!on) continue;
      var px = x + col * scale;
      var py = y + row * scale;
      for (var dy = 0; dy < scale; dy++) {
        for (var dx = 0; dx < scale; dx++) {
          setPixel(codes, px + dx, py + dy, width, height, colorCode);
        }
      }
    }
  }
}

function wrapText(text, maxWidth, scale) {
  scale = scale || 1;
  var charWidth = CHAR_ADVANCE * scale;
  var maxCharsPerLine = Math.max(1, Math.floor(maxWidth / charWidth));
  var lines = [];
  var current = '';

  for (var i = 0; i < text.length; i++) {
    if (current.length >= maxCharsPerLine) {
      lines.push(current);
      current = '';
    }
    current += text[i];
  }
  if (current) lines.push(current);

  return lines;
}

// Render text into the codes array starting at (x, y) with the given colorCode.
// Returns the number of lines actually drawn.
function renderText(text, x, y, codes, width, height, colorCode, options) {
  if (!text) return 0;
  text = String(text);
  options = options || {};
  var scale = options.scale || 1;
  var maxWidth = options.maxWidth != null ? options.maxWidth : (width - x);
  var maxLines = options.maxLines != null ? options.maxLines : 5;
  var allowCJKPlaceholder = options.cjkPlaceholder !== false;

  var lines = wrapText(text, maxWidth, scale);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    // Replace last line's tail with ellipsis. Trim enough room for "...".
    var lastIdx = lines.length - 1;
    var trimmed = lines[lastIdx];
    if (trimmed.length > 3) {
      trimmed = trimmed.slice(0, trimmed.length - 3);
    } else {
      trimmed = '';
    }
    lines[lastIdx] = trimmed + '...';
  }

  var linesDrawn = 0;
  for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    var line = lines[lineIdx];
    var lineY = y + lineIdx * LINE_ADVANCE * scale;
    if (lineY + GLYPH_HEIGHT * scale > height) break;

    for (var charIdx = 0; charIdx < line.length; charIdx++) {
      var rawCh = line[charIdx];
      var ch = rawCh.toUpperCase();
      var glyph = FONT_5x7[ch];

      var charX = x + charIdx * CHAR_ADVANCE * scale;

      if (!glyph) {
        // CJK or unknown high codepoint: draw placeholder if enabled.
        if (isHighCodepoint(rawCh) && allowCJKPlaceholder) {
          renderCJKPlaceholder(charX, lineY, codes, width, height, colorCode, scale);
        } else {
          // Unknown ASCII punctuation: render a space (still non-empty gap).
          glyph = FONT_5x7[' '];
        }
      }
      if (!glyph) continue;

      for (var row = 0; row < GLYPH_HEIGHT; row++) {
        for (var col = 0; col < GLYPH_WIDTH; col++) {
          if (glyph[row][col] === '1') {
            var px = charX + col * scale;
            var py = lineY + row * scale;
            for (var dy = 0; dy < scale; dy++) {
              for (var dx = 0; dx < scale; dx++) {
                setPixel(codes, px + dx, py + dy, width, height, colorCode);
              }
            }
          }
        }
      }
    }
    linesDrawn++;
  }

  return linesDrawn;
}

module.exports = {
  FONT_5x7: FONT_5x7,
  GLYPH_WIDTH: GLYPH_WIDTH,
  GLYPH_HEIGHT: GLYPH_HEIGHT,
  CHAR_ADVANCE: CHAR_ADVANCE,
  LINE_ADVANCE: LINE_ADVANCE,
  renderText: renderText,
  wrapText: wrapText,
  renderCJKPlaceholder: renderCJKPlaceholder,
  isCJKChar: isCJKChar,
  isHighCodepoint: isHighCodepoint,
  isCJKFontAvailable: function() { return CJK_FONT_AVAILABLE; },
};
