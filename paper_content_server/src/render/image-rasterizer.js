// image-rasterizer.js — Rasterize an image file into palette codes
// Uses sharp to load/resize, then quantizes each pixel to the e-paper palette.
// On any error (missing file, decode failure, HTTP fetch failure) it falls back
// to a filled placeholder region so callers always get a deterministic frame.

var fs = require('fs');
var sharp = require('sharp');
var quantizer = require('../epaper/quantizer');
var palette = require('../epaper/palette');

function clampDimensions(destWidth, destHeight) {
  var w = Math.max(1, Math.floor(destWidth));
  var h = Math.max(1, Math.floor(destHeight));
  return { width: w, height: h };
}

function fallbackFill(codes, destX, destY, destWidth, destHeight, canvasWidth, canvasHeight, fallbackCode) {
  var code = (fallbackCode != null) ? fallbackCode : 0;
  palette.assertAllowedCode(code);
  var dim = clampDimensions(destWidth, destHeight);
  for (var y = 0; y < dim.height; y++) {
    for (var x = 0; x < dim.width; x++) {
      var px = destX + x;
      var py = destY + y;
      if (px < 0 || px >= canvasWidth || py < 0 || py >= canvasHeight) continue;
      codes[py * canvasWidth + px] = code;
    }
  }
}

function rasterizeImage(imagePath, destX, destY, destWidth, destHeight, codes, canvasWidth, canvasHeight, options) {
  options = options || {};
  var mode = options.mode || 'contain';
  var fallbackCode = options.fallbackCode != null ? options.fallbackCode : 0;
  var fit = mode === 'crop' ? 'cover' : 'inside';

  var dim = clampDimensions(destWidth, destHeight);

  // Reject obvious non-local inputs (URLs) up front so tests don't hit the network.
  if (typeof imagePath !== 'string' || imagePath.length === 0) {
    fallbackFill(codes, destX, destY, dim.width, dim.height, canvasWidth, canvasHeight, fallbackCode);
    return Promise.resolve(null);
  }
  if (/^https?:\/\//i.test(imagePath) || /^ftp:\/\//i.test(imagePath)) {
    fallbackFill(codes, destX, destY, dim.width, dim.height, canvasWidth, canvasHeight, fallbackCode);
    return Promise.resolve(null);
  }
  try {
    if (!fs.existsSync(imagePath)) {
      fallbackFill(codes, destX, destY, dim.width, dim.height, canvasWidth, canvasHeight, fallbackCode);
      return Promise.resolve(null);
    }
  } catch (e) {
    fallbackFill(codes, destX, destY, dim.width, dim.height, canvasWidth, canvasHeight, fallbackCode);
    return Promise.resolve(null);
  }

  return sharp(imagePath)
    .resize(dim.width, dim.height, { fit: fit })
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(function(out) {
      var buf = out.data;
      var info = out.info;
      var imgW = info.width;
      var imgH = info.height;
      var channels = info.channels || 3;
      // For 'inside' fit, actual imgW/H may be smaller than dim — center it.
      var offsetX = Math.floor((dim.width - imgW) / 2);
      var offsetY = Math.floor((dim.height - imgH) / 2);

      for (var y = 0; y < imgH; y++) {
        for (var x = 0; x < imgW; x++) {
          var idx = (y * imgW + x) * channels;
          var r = buf[idx];
          var g = buf[idx + 1] != null ? buf[idx + 1] : r;
          var b = buf[idx + 2] != null ? buf[idx + 2] : r;
          var code = quantizer.quantizePixel(r, g, b);
          var px = destX + x + offsetX;
          var py = destY + y + offsetY;
          if (px < 0 || px >= canvasWidth || py < 0 || py >= canvasHeight) continue;
          codes[py * canvasWidth + px] = code;
        }
      }
      return null;
    })
    .catch(function() {
      // Any decode/resize failure: fall back to placeholder fill (still deterministic).
      fallbackFill(codes, destX, destY, dim.width, dim.height, canvasWidth, canvasHeight, fallbackCode);
      return null;
    });
}

module.exports = {
  rasterizeImage: rasterizeImage,
  fallbackFill: fallbackFill,
};
