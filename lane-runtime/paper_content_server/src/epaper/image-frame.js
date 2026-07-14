// image-frame.js — Full image-to-EPF1-frame pipeline
// Mirrors imageToFrameBuffer and buildFrameBuffer from server.js.
// Do NOT change resize, crop, alpha handling, dithering, or output bytes.

var palette = require('./palette');
var quantizer = require('./quantizer');
var epf1 = require('./epf1');

function imageToFrameBuffer(raw, width, height, channels, dithering) {
  dithering = dithering || false;
  var C = epf1.EPF1_CONSTANTS;
  var output = Buffer.alloc(C.PAYLOAD_BYTES, 0x11);
  var pixels = quantizer.extractPixels(raw, width, height, channels);

  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var index = (y * width + x) * 3;
      var r = pixels[index];
      var g = pixels[index + 1];
      var b = pixels[index + 2];
      var code = palette.nearestPaletteCode(r, g, b);
      var color = palette.getPaletteColor(code);
      if (dithering && color) {
        var er = r - color.rgb[0];
        var eg = g - color.rgb[1];
        var eb = b - color.rgb[2];
        quantizer.distributeError(pixels, width, height, x + 1, y, er, eg, eb, 7 / 16);
        quantizer.distributeError(pixels, width, height, x - 1, y + 1, er, eg, eb, 3 / 16);
        quantizer.distributeError(pixels, width, height, x, y + 1, er, eg, eb, 5 / 16);
        quantizer.distributeError(pixels, width, height, x + 1, y + 1, er, eg, eb, 1 / 16);
      }
      var pixelIndex = y * width + x;
      var byteIndex = Math.floor(pixelIndex / 2);
      if (pixelIndex % 2 === 0) {
        output[byteIndex] = (output[byteIndex] & 0x0F) | ((code & 0x0F) << 4);
      } else {
        output[byteIndex] = (output[byteIndex] & 0xF0) | (code & 0x0F);
      }
    }
  }
  return output;
}

function buildFrameBuffer(frameImage) {
  var header = epf1.buildHeader();
  return Buffer.concat([header, frameImage]);
}

module.exports = {
  imageToFrameBuffer: imageToFrameBuffer,
  buildFrameBuffer: buildFrameBuffer,
};
