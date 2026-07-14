// quantizer.js — Color quantization and Floyd-Steinberg dithering
// Mirrors nearestPaletteCode and distributeError from server.js.
// Do NOT change threshold, distance, dither coefficients, or alpha handling.

var palette = require('./palette');

function clampColor(value) {
  return Math.max(0, Math.min(255, value));
}

function distributeError(pixels, width, height, x, y, er, eg, eb, factor) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  var index = (y * width + x) * 3;
  pixels[index] = clampColor(pixels[index] + er * factor);
  pixels[index + 1] = clampColor(pixels[index + 1] + eg * factor);
  pixels[index + 2] = clampColor(pixels[index + 2] + eb * factor);
}

function quantizePixel(r, g, b) {
  return palette.nearestPaletteCode(r, g, b);
}

function extractPixels(raw, width, height, channels) {
  var inputChannels = Math.max(3, Number(channels) || 3);
  var pixels = new Float32Array(width * height * 3);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var pixelIndex = y * width + x;
      var offset = pixelIndex * inputChannels;
      var p = pixelIndex * 3;
      var r = raw[offset] != null ? raw[offset] : 255;
      var g = raw[offset + 1] != null ? raw[offset + 1] : r;
      var b = raw[offset + 2] != null ? raw[offset + 2] : r;
      if (inputChannels >= 4) {
        var a = raw[offset + 3] != null ? raw[offset + 3] : 255;
        if (a < 128) {
          r = 255; g = 255; b = 255;
        }
      }
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
    }
  }
  return pixels;
}

module.exports = {
  clampColor: clampColor,
  distributeError: distributeError,
  quantizePixel: quantizePixel,
  extractPixels: extractPixels,
};
