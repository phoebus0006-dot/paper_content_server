// text-rasterizer.js — Simple bitmap text rasterizer
// Uses an internal 5x7 bitmap font supporting ASCII letters/digits/basic punctuation.
// CJK characters are rasterized through sharp's SVG text pipeline (librsvg + pango +
// harfbuzz + freetype) so real glyphs reach the e-paper frame instead of placeholder
// blocks. The rasterizer writes palette codes directly into a flat codes array
// (y*width + x).

var fs = require('fs');
var fontDetector = require('./font-detector');

// sharp is an optional peer for the ASCII-only path; required for real CJK glyphs.
// Load lazily so test environments without sharp can still exercise the 5x7 font.
var _sharp = null;
function getSharp() {
  if (_sharp !== null) return _sharp;
  try { _sharp = require('sharp'); } catch (e) { _sharp = false; }
  return _sharp;
}

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

// === Real CJK glyph rasterization via sharp SVG text ===
// The pipeline:
//   1. Detect a system CJK font once at module load (font-detector.js).
//   2. renderTextAsync() routes ASCII-only text to the fast sync 5x7 path, and
//      routes text containing CJK through sharp's SVG text renderer
//      (librsvg + pango + harfbuzz + freetype).
//   3. The SVG output is rendered with an alpha channel; any pixel whose alpha
//      crosses a threshold is blitted into the destination codes array using the
//      requested palette code. Anti-aliasing greys are not preserved — the
//      e-paper panel only supports six discrete colours.
//
// The font is embedded via SVG @font-face with a file:// URL so rendering does
// not depend on fontconfig's family-name index being warm. This keeps output
// deterministic across processes and avoids silent fallback to a non-CJK font.

var CJK_FONT_INFO = fontDetector.detectCJKFont();
var NOT_READY_REASON = CJK_FONT_INFO.available ? null
  : (CJK_FONT_INFO.fallbackReason || 'CJK_FONT_NOT_AVAILABLE');

// Render scale → pixel font size mapping. Scale 1 mirrors the 5x7 font's
// visual height (~8px line advance); scale 2 doubles it for titles.
function fontSizeForScale(scale) {
  var s = scale || 1;
  if (s <= 1) return 14;
  if (s === 2) return 28;
  return 14 * s;
}

function lineHeightForFontSize(fontSize) {
  return Math.max(1, Math.ceil(fontSize * 1.25));
}

// Estimate the advance width of a single character at a given font size.
// CJK ideographs and full-width punctuation are ~1em; ASCII is ~0.55em.
function estimateCharWidth(ch, fontSize) {
  var code = ch.charCodeAt(0);
  if (code <= 0x7F) {
    if (ch === ' ' || ch === '\u3000') return fontSize * 0.28;
    if (ch === 'i' || ch === 'l' || ch === 'I' || ch === '!' ||
        ch === '.' || ch === ',' || ch === "'" || ch === ':' || ch === ';') {
      return fontSize * 0.30;
    }
    if (ch === 'm' || ch === 'M' || ch === 'W' || ch === 'w') return fontSize * 0.75;
    return fontSize * 0.55;
  }
  // CJK Unified Ideographs, CJK punctuation, Fullwidth forms are all ~1em.
  if (isCJKChar(ch)) return fontSize;
  // Other high codepoints (extended Latin, etc.) — assume ~0.55em as a rough
  // approximation; librsvg will lay them out correctly regardless.
  return fontSize * 0.55;
}

function measureTextWidth(text, fontSize) {
  var w = 0;
  for (var i = 0; i < text.length; i++) {
    w += estimateCharWidth(text[i], fontSize);
  }
  return w;
}

// Word-aware wrapping for mixed CJK/ASCII text.
//   - CJK chars break freely (each char is its own break opportunity).
//   - ASCII runs break on spaces; a single word longer than maxWidth is
//     hard-split at the character level so it never overflows.
function wrapTextForCJK(text, maxWidth, fontSize) {
  if (!text) return [];
  var lines = [];
  var current = '';
  var currentWidth = 0;
  var i = 0;

  function pushCurrent() {
    lines.push(current);
    current = '';
    currentWidth = 0;
  }

  function appendChar(ch, w) {
    // If adding this char would overflow and we already have content, flush.
    if (currentWidth > 0 && currentWidth + w > maxWidth) {
      pushCurrent();
    }
    current += ch;
    currentWidth += w;
  }

  while (i < text.length) {
    var ch = text[i];

    if (isCJKChar(ch)) {
      appendChar(ch, estimateCharWidth(ch, fontSize));
      i++;
      continue;
    }

    // ASCII whitespace — break opportunity.
    if (ch === ' ' || ch === '\t') {
      if (currentWidth > 0 && currentWidth + estimateCharWidth(ch, fontSize) > maxWidth) {
        pushCurrent();
        // Skip the whitespace at the line break.
        i++;
        continue;
      }
      appendChar(ch, estimateCharWidth(ch, fontSize));
      i++;
      continue;
    }

    // ASCII word — read until next whitespace.
    var word = '';
    var wordWidth = 0;
    while (i < text.length) {
      var wc = text[i];
      if (wc === ' ' || wc === '\t' || isCJKChar(wc)) break;
      word += wc;
      wordWidth += estimateCharWidth(wc, fontSize);
      i++;
    }

    if (wordWidth <= maxWidth) {
      // Word fits on a line by itself; if it doesn't fit on the current line,
      // flush first.
      if (currentWidth > 0 && currentWidth + wordWidth > maxWidth) {
        pushCurrent();
      }
      current += word;
      currentWidth += wordWidth;
    } else {
      // Word longer than maxWidth — hard-split character by character.
      for (var k = 0; k < word.length; k++) {
        appendChar(word[k], estimateCharWidth(word[k], fontSize));
      }
    }
  }

  if (currentWidth > 0 || current.length > 0) pushCurrent();
  return lines;
}

function applyEllipsis(lines, maxLines, fontSize, maxWidth) {
  if (lines.length <= maxLines) return lines;
  var kept = lines.slice(0, maxLines).slice();
  var last = kept[maxLines - 1];
  var ellipsisWidth = estimateCharWidth('\u2026', fontSize);
  // Trim the last line until last + ellipsis fits.
  while (last.length > 0 && measureTextWidth(last, fontSize) + ellipsisWidth > maxWidth) {
    last = last.slice(0, -1);
  }
  kept[maxLines - 1] = last + '\u2026';
  return kept;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hasCJK(text) {
  if (!text) return false;
  for (var i = 0; i < text.length; i++) {
    if (isCJKChar(text[i])) return true;
  }
  return false;
}

// Build an SVG document whose text layer renders the supplied wrapped lines.
// The text is drawn on a transparent background so we can blit only the
// glyph pixels (alpha > 0) into the destination codes array.
function buildTextSvg(lines, fontSize, lineHeight, maxWidth, fontInfo) {
  var svgWidth = Math.max(1, Math.floor(maxWidth));
  var svgHeight = Math.max(1, lines.length * lineHeight + Math.ceil(fontSize * 0.3));
  var fontUrl = fontInfo.path ? fontDetector.pathToFileUrl(fontInfo.path) : '';
  var familyName = fontInfo.family || 'sans-serif';

  var styleBlock = '';
  if (fontUrl) {
    // Embed the font explicitly via @font-face so rendering is independent of
    // fontconfig's family-name cache.
    styleBlock = '<style>' +
      '@font-face { font-family: "LaneCjkFont"; src: url("' + fontUrl + '"); }' +
      '</style>';
    familyName = 'LaneCjkFont';
  }

  var tspans = '';
  for (var i = 0; i < lines.length; i++) {
    // tspan y = baseline of line i+1. Use lineHeight * (i+1) - descender.
    var baseline = Math.floor((i + 1) * lineHeight - fontSize * 0.2);
    tspans += '<tspan x="0" y="' + baseline + '">' + escapeXml(lines[i]) + '</tspan>';
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'width="' + svgWidth + '" height="' + svgHeight + '">' +
    '<defs>' + styleBlock + '</defs>' +
    '<text font-family="' + escapeXml(familyName) + '" ' +
    'font-size="' + fontSize + '" fill="black">' + tspans + '</text>' +
    '</svg>';
}

// Blit the rendered SVG pixels (where alpha >= ALPHA_THRESHOLD) into the codes
// array at (destX, destY) using the requested palette colorCode.
var ALPHA_THRESHOLD = 64;

function blitAlphaPixels(rawBuf, imgW, imgH, channels, destX, destY, codes, canvasW, canvasH, colorCode) {
  var alphaIdx = channels - 1;
  var drawn = 0;
  for (var py = 0; py < imgH; py++) {
    var dy = destY + py;
    if (dy < 0 || dy >= canvasH) continue;
    for (var px = 0; px < imgW; px++) {
      var a = rawBuf[(py * imgW + px) * channels + alphaIdx];
      if (a < ALPHA_THRESHOLD) continue;
      var dx = destX + px;
      if (dx < 0 || dx >= canvasW) continue;
      codes[dy * canvasW + dx] = colorCode;
      drawn++;
    }
  }
  return drawn;
}

// Asynchronous text rendering entry point.
//
// Behaviour:
//   - ASCII-only text → delegates to the sync renderText() (5x7 font) and
//     resolves immediately. This keeps the existing ASCII tests fast and
//     deterministic without paying the sharp cost.
//   - Text containing CJK and a ready CJK font → renders real glyphs via
//     sharp SVG text and blits the alpha pixels into the codes array.
//   - Text containing CJK but no ready font → resolves with 0 lines drawn.
//     Callers can inspect isReady() / notReadyReason() beforehand. We do NOT
//     silently fall back to placeholder blocks.
//
// options:
//   scale, maxWidth, maxLines — same meaning as renderText().
//   fontInfo — optional override of the detected font (used by tests to
//              simulate missing-font scenarios).
function renderTextAsync(text, x, y, codes, width, height, colorCode, options) {
  if (!text) return Promise.resolve(0);
  text = String(text);
  options = options || {};
  var scale = options.scale || 1;
  var maxWidth = options.maxWidth != null ? options.maxWidth : (width - x);
  var maxLines = options.maxLines != null ? options.maxLines : 5;

  if (!hasCJK(text)) {
    // ASCII-only fast path: reuse the sync 5x7 rasterizer.
    return Promise.resolve(renderText(text, x, y, codes, width, height, colorCode, options));
  }

  var fontInfo = options.fontInfo || CJK_FONT_INFO;
  if (!fontInfo || !fontInfo.available) {
    // CJK present but no usable font — do NOT silently draw placeholder.
    return Promise.resolve(0);
  }

  var sharpLib = getSharp();
  if (!sharpLib) {
    // sharp not installed — cannot render real CJK glyphs. Report not ready
    // rather than falling back to placeholder blocks.
    return Promise.resolve(0);
  }

  var fontSize = fontSizeForScale(scale);
  var lineHeight = lineHeightForFontSize(fontSize);
  var lines = wrapTextForCJK(text, maxWidth, fontSize);
  lines = applyEllipsis(lines, maxLines, fontSize, maxWidth);
  if (lines.length === 0) return Promise.resolve(0);

  // Clamp the SVG width so it never exceeds the available canvas real estate
  // to the right of x. This protects against integer overflows and useless
  // huge SVG buffers when maxWidth is enormous.
  var svgMaxWidth = Math.max(1, Math.min(maxWidth, width - x));
  var svg;
  try {
    svg = buildTextSvg(lines, fontSize, lineHeight, svgMaxWidth, fontInfo);
  } catch (e) {
    return Promise.resolve(0);
  }

  return sharpLib(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(function (out) {
      var drawn = blitAlphaPixels(
        out.data, out.info.width, out.info.height, out.info.channels,
        x, y, codes, width, height, colorCode
      );
      // Suppress unused-variable warning while keeping the diagnostic around
      // for future tuning.
      void drawn;
      return lines.length;
    })
    .catch(function () {
      // Any rendering failure (corrupt font, OOM, etc.) — refuse to silently
      // fall back. Report zero lines drawn so callers see no glyphs.
      return 0;
    });
}

module.exports = {
  FONT_5x7: FONT_5x7,
  GLYPH_WIDTH: GLYPH_WIDTH,
  GLYPH_HEIGHT: GLYPH_HEIGHT,
  CHAR_ADVANCE: CHAR_ADVANCE,
  LINE_ADVANCE: LINE_ADVANCE,
  renderText: renderText,
  renderTextAsync: renderTextAsync,
  wrapText: wrapText,
  wrapTextForCJK: wrapTextForCJK,
  applyEllipsis: applyEllipsis,
  renderCJKPlaceholder: renderCJKPlaceholder,
  isCJKChar: isCJKChar,
  isHighCodepoint: isHighCodepoint,
  hasCJK: hasCJK,
  isCJKFontAvailable: function() { return CJK_FONT_AVAILABLE; },
  probeCJKFont: function() { return CJK_FONT_INFO; },
  isReady: function() { return CJK_FONT_INFO.available; },
  notReadyReason: function() { return NOT_READY_REASON; },
};
