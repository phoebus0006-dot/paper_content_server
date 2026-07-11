// palette.js — E-Paper frame palette constants and utilities
// Mirrors the PALETTE array and nearestPaletteCode from server.js.
// Do NOT change color-to-code mappings, order, or distance computation.

var PALETTE = [
  { code: 0, name: 'black', rgb: [0, 0, 0] },
  { code: 1, name: 'white', rgb: [255, 255, 255] },
  { code: 2, name: 'yellow', rgb: [255, 255, 0] },
  { code: 3, name: 'red', rgb: [255, 0, 0] },
  { code: 5, name: 'blue', rgb: [0, 0, 255] },
  { code: 6, name: 'green', rgb: [0, 255, 0] },
];

var ALLOWED_CODES = [0, 1, 2, 3, 5, 6];

function isAllowedCode(code) {
  return ALLOWED_CODES.indexOf(code) >= 0;
}

function assertAllowedCode(code) {
  if (!isAllowedCode(code)) {
    throw new Error('Invalid palette code: ' + code + '. Allowed: ' + ALLOWED_CODES.join(','));
  }
}

function getPaletteColor(code) {
  for (var i = 0; i < PALETTE.length; i++) {
    if (PALETTE[i].code === code) return PALETTE[i];
  }
  return null;
}

function nearestPaletteCode(r, g, b) {
  var best = PALETTE[0];
  var bestDistance = Number.POSITIVE_INFINITY;
  for (var i = 0; i < PALETTE.length; i++) {
    var color = PALETTE[i];
    var dr = r - color.rgb[0];
    var dg = g - color.rgb[1];
    var db = b - color.rgb[2];
    var distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best.code;
}

module.exports = {
  PALETTE: PALETTE,
  ALLOWED_CODES: ALLOWED_CODES,
  isAllowedCode: isAllowedCode,
  assertAllowedCode: assertAllowedCode,
  getPaletteColor: getPaletteColor,
  nearestPaletteCode: nearestPaletteCode,
};
