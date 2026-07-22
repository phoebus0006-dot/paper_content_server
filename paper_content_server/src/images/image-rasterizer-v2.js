const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');
const epaperImageFrame = require('../epaper/image-frame');
const epf1 = require('../epaper/epf1');
const { ImageRecipeService } = require('./image-recipe-service');

class ImageRasterizer {
  constructor(options = {}) {
    this.recipeService = options.recipeService || new ImageRecipeService();
  }

  getVersion() {
    return 'v2-strict';
  }

  async removeAlpha(inputBuffer) {
    return sharp(inputBuffer).removeAlpha().toBuffer();
  }

  async rasterize(inputPath, recipe, frameDimensions) {
    if (!fs.existsSync(inputPath)) {
      throw new Error('File not found: ' + inputPath);
    }
    var result = await this.recipeService.processImage(inputPath, recipe);

    var raw = result.buffer;
    var info = result.info;
    var framePayload = epaperImageFrame.imageToFrameBuffer(
      raw, info.width || frameDimensions.width, info.height || frameDimensions.height, info.channels || 3, true
    );
    var frameBuffer = epaperImageFrame.buildFrameBuffer(framePayload);
    var hash = crypto.createHash('sha256').update(frameBuffer).digest('hex');

    return { frameBuffer: frameBuffer, info: info, hash: hash };
  }
}

module.exports = { ImageRasterizer };
