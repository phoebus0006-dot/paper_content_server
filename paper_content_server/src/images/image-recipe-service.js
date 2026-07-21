const crypto = require('crypto');
const sharp = require('sharp');
const fs = require('fs');

class ImageRecipeService {
  constructor(dependencies = {}) {
    this.assetRepository = dependencies.assetRepository || null;
    this.imageRasterizer = dependencies.imageRasterizer || null;
  }

  normalizeRecipe(inputRecipe) {
    const clamp = (val, min, max, def) => {
      if (typeof val !== 'number' || !isFinite(val) || isNaN(val)) return def;
      return Math.max(min, Math.min(max, val));
    };

    const r = inputRecipe || {};
    const fitMode = ['contain', 'cover', 'manual_crop'].includes(r.fitMode) ? r.fitMode : 'contain';

    const crop = r.crop || {};
    const cx = clamp(crop.x, 0, 1, 0);
    const cy = clamp(crop.y, 0, 1, 0);
    const cw = clamp(crop.width, 0.0001, 1, 1);
    const ch = clamp(crop.height, 0.0001, 1, 1);

    const safeCrop = {
      x: cx,
      y: cy,
      width: cx + cw > 1 ? 1 - cx : cw,
      height: cy + ch > 1 ? 1 - cy : ch
    };

    const rotateStr = String(r.rotate);
    let rotate = 0;
    if (['90', '180', '270'].includes(rotateStr)) rotate = parseInt(rotateStr, 10);

    return {
      fitMode: fitMode,
      crop: safeCrop,
      zoom: clamp(r.zoom, 0.1, 10, 1),
      panX: clamp(r.panX, -1, 1, 0),
      panY: clamp(r.panY, -1, 1, 0),
      rotate: rotate,
      flipHorizontal: Boolean(r.flipHorizontal),
      flipVertical: Boolean(r.flipVertical),
      brightness: clamp(r.brightness, 0, 3, 1),
      contrast: clamp(r.contrast, 0, 3, 1),
      saturation: clamp(r.saturation, 0, 3, 1),
      gamma: clamp(r.gamma, 0.1, 10, 1),
      sharpen: clamp(r.sharpen, 0, 10, 0),
      blur: clamp(r.blur, 0, 20, 0),
      background: (r.background || '#ffffff').slice(0, 7)
    };
  }

  _sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this._sortObjectKeys(item));
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this._sortObjectKeys(obj[key]);
    });
    return sorted;
  }

  hashRecipe(recipe) {
    const sorted = this._sortObjectKeys(recipe);
    const str = JSON.stringify(sorted);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  async processImage(inputPath, recipe) {
    if (!inputPath) throw new Error('Input path is required');
    if (!recipe || typeof recipe !== 'object') throw new Error('Recipe is required');
    if (!fs.existsSync(inputPath)) throw new Error(`File not found: ${inputPath}`);

    const canonicalRecipe = this.normalizeRecipe(recipe);
    const hash = this.hashRecipe(canonicalRecipe);

    let img = sharp(inputPath);

    img = img.flatten({ background: canonicalRecipe.background || '#ffffff' });

    if (canonicalRecipe.rotate) {
      img = img.rotate(canonicalRecipe.rotate);
    }
    if (canonicalRecipe.flipHorizontal) {
      img = img.flop();
    }
    if (canonicalRecipe.flipVertical) {
      img = img.flip();
    }

    if (canonicalRecipe.fitMode === 'contain') {
      img = img.resize(800, 480, {
        fit: 'contain',
        background: canonicalRecipe.background || '#ffffff'
      });
    } else if (canonicalRecipe.fitMode === 'cover') {
      img = img.resize(800, 480, {
        fit: 'cover',
        position: 'center'
      });
    } else if (canonicalRecipe.fitMode === 'manual_crop') {
      const currentMeta = await img.toBuffer().then(b => sharp(b).metadata());

      const cx = Math.floor(canonicalRecipe.crop.x * currentMeta.width);
      const cy = Math.floor(canonicalRecipe.crop.y * currentMeta.height);
      const cw = Math.max(1, Math.floor(canonicalRecipe.crop.width * currentMeta.width));
      const ch = Math.max(1, Math.floor(canonicalRecipe.crop.height * currentMeta.height));
      const cropW = Math.min(cw, currentMeta.width - cx);
      const cropH = Math.min(ch, currentMeta.height - cy);

      img = img.extract({
        left: cx, top: cy, width: cropW, height: cropH
      });

      if (canonicalRecipe.zoom > 1) {
        const zw = Math.max(1, Math.floor(cropW / canonicalRecipe.zoom));
        const zh = Math.max(1, Math.floor(cropH / canonicalRecipe.zoom));

        const pxOffset = canonicalRecipe.panX * (cropW - zw) / 2;
        const pyOffset = canonicalRecipe.panY * (cropH - zh) / 2;

        const zx = Math.max(0, Math.floor((cropW - zw) / 2 + pxOffset));
        const zy = Math.max(0, Math.floor((cropH - zh) / 2 + pyOffset));

        img = img.extract({
          left: zx, top: zy,
          width: Math.min(zw, cropW - zx),
          height: Math.min(zh, cropH - zy)
        });
      }

      img = img.resize(800, 480, {
        fit: 'fill'
      });
    }

    img = img.modulate({
      brightness: canonicalRecipe.brightness,
      saturation: canonicalRecipe.saturation,
    });

    if (canonicalRecipe.gamma !== 1) {
      img = img.gamma(canonicalRecipe.gamma);
    }
    if (canonicalRecipe.sharpen > 0) {
      img = img.sharpen({ sigma: canonicalRecipe.sharpen });
    }
    if (canonicalRecipe.blur > 0) {
      img = img.blur(canonicalRecipe.blur);
    }

    img = img.removeAlpha();

    const { data, info } = await img.png().toBuffer({ resolveWithObject: true });

    return { buffer: data, info, hash };
  }

  async processAsset(assetId, recipe, options = {}) {
    if (!this.assetRepository) throw new Error('Asset repository not configured');
    if (!this.imageRasterizer) throw new Error('Image rasterizer not configured');

    const asset = await this.assetRepository.getAsset(assetId);
    if (!asset) throw new Error(`Asset not found: ${assetId}`);

    if (asset.safetyStatus !== 'SAFE' && !options.skipSafetyCheck) {
      throw new Error(`Asset not safe: ${asset.safetyStatus}`);
    }
    if (asset.reviewStatus !== 'APPROVED' && !options.skipReviewCheck) {
      throw new Error(`Asset not approved: ${asset.reviewStatus}`);
    }

    const canonicalRecipe = this.normalizeRecipe(recipe);
    const sourceHash = asset.sha256 || crypto.createHash('sha256').update(assetId).digest('hex');
    const rendererVersion = this.imageRasterizer.getVersion ? this.imageRasterizer.getVersion() : 'v1';

    const recipeHashStr = `${sourceHash}:${JSON.stringify(canonicalRecipe)}:${rendererVersion}`;
    const recipeHash = crypto.createHash('sha256').update(recipeHashStr).digest('hex');

    const rasterResult = await this.imageRasterizer.rasterize(
      asset.rawPath || asset.path,
      canonicalRecipe,
      { width: 800, height: 480 }
    );

    const processedImageHash = crypto.createHash('sha256').update(rasterResult.frameBuffer).digest('hex');

    return {
      assetId,
      sourceHash,
      canonicalRecipe,
      recipeHash,
      rendererVersion,
      processedImageHash,
      buffer: rasterResult.frameBuffer,
      mimeType: 'application/epf1'
    };
  }
}

module.exports = { ImageRecipeService };
