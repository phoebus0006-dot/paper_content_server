const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

class ImageRasterizer {
  getVersion() {
    return 'v2-strict';
  }

  async rasterize(imagePath, recipe, targetSize) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }

    const { width, height } = targetSize;
    let img = sharp(imagePath);
    const metadata = await img.metadata();
    
    // Normalize transparency to white background FIRST
    img = img.flatten({ background: recipe.background || '#ffffff' });

    // Handle rotation/flip
    if (recipe.rotate) {
      img = img.rotate(recipe.rotate);
    }
    if (recipe.flipHorizontal) {
      img = img.flop();
    }
    if (recipe.flipVertical) {
      img = img.flip();
    }

    // Handle scaling/fitting
    if (recipe.fitMode === 'contain') {
      img = img.resize(width, height, {
        fit: 'contain',
        background: recipe.background || '#ffffff'
      });
    } else if (recipe.fitMode === 'cover') {
      img = img.resize(width, height, {
        fit: 'cover',
        position: 'center'
      });
    } else if (recipe.fitMode === 'manual_crop') {
      // Single metadata call to get current dimensions after rotate/flip
      const currentMeta = await img.toBuffer().then(b => sharp(b).metadata());

      const cx = Math.floor(recipe.crop.x * currentMeta.width);
      const cy = Math.floor(recipe.crop.y * currentMeta.height);
      const cw = Math.max(1, Math.floor(recipe.crop.width * currentMeta.width));
      const ch = Math.max(1, Math.floor(recipe.crop.height * currentMeta.height));
      const cropW = Math.min(cw, currentMeta.width - cx);
      const cropH = Math.min(ch, currentMeta.height - cy);

      img = img.extract({
        left: cx, top: cy, width: cropW, height: cropH
      });

      if (recipe.zoom > 1) {
          const zw = Math.max(1, Math.floor(cropW / recipe.zoom));
          const zh = Math.max(1, Math.floor(cropH / recipe.zoom));

          const pxOffset = recipe.panX * (cropW - zw) / 2;
          const pyOffset = recipe.panY * (cropH - zh) / 2;

          const zx = Math.max(0, Math.floor((cropW - zw) / 2 + pxOffset));
          const zy = Math.max(0, Math.floor((cropH - zh) / 2 + pyOffset));

          img = img.extract({
              left: zx, top: zy, width: Math.min(zw, cropW - zx), height: Math.min(zh, cropH - zy)
          });
      }

      img = img.resize(width, height, {
          fit: 'fill'
      });
    }

    // Color adjustments
    img = img.modulate({
      brightness: recipe.brightness,
      saturation: recipe.saturation,
    });

    if (recipe.gamma && recipe.gamma !== 1) {
      img = img.gamma(recipe.gamma);
    }
    if (recipe.sharpen > 0) {
      img = img.sharpen({ sigma: recipe.sharpen });
    }
    if (recipe.blur > 0) {
      img = img.blur(recipe.blur);
    }

    // Ensure final output is 3-channel RGB (no alpha)
    img = img.removeAlpha();

    const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) {
      throw new Error(`Output image has ${info.channels} channels, expected 3`);
    }
    return { buffer: data, mimeType: 'image/png' };
  }
}

module.exports = { ImageRasterizer };
