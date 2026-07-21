const sharp = require('sharp');
const crypto = require('crypto');
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

  async _convertToEPF1(pngBuffer, frameDimensions) {
    const width = frameDimensions.width;
    const height = frameDimensions.height;
    const pixelCount = width * height;

    const { data } = await sharp(pngBuffer)
      .resize(width, height)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const frameData = Buffer.alloc(Math.ceil(pixelCount / 2));
    for (let i = 0; i < pixelCount; i += 2) {
      const high = data[i] >> 4;
      const low = (i + 1 < pixelCount) ? data[i + 1] >> 4 : 0;
      frameData[i >> 1] = (high << 4) | low;
    }

    const header = Buffer.alloc(16);
    header.write('EPF1', 0, 4, 'ascii');
    header.writeUInt16LE(width, 4);
    header.writeUInt16LE(height, 6);
    header.writeUInt32LE(frameData.length, 8);

    return Buffer.concat([header, frameData]);
  }

  async rasterize(inputPath, recipe, frameDimensions) {
    const result = await this.recipeService.processImage(inputPath, recipe);

    const frameBuffer = await this._convertToEPF1(result.buffer, frameDimensions);
    const hash = crypto.createHash('sha256').update(frameBuffer).digest('hex');

    return { frameBuffer, info: result.info, hash };
  }
}

module.exports = { ImageRasterizer };
