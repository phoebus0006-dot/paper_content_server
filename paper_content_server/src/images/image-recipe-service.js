const crypto = require('crypto');

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
    
    // Ensure 0 is preserved
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

  hashRecipe(recipe) {
    const str = JSON.stringify(recipe);
    return crypto.createHash('sha256').update(str).digest('hex');
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

    // Call pure rasterizer
    const rasterResult = await this.imageRasterizer.rasterize(asset.rawPath || asset.path, canonicalRecipe, { width: 800, height: 480 });

    const processedImageHash = crypto.createHash('sha256').update(rasterResult.buffer).digest('hex');

    return {
      assetId,
      sourceHash,
      canonicalRecipe,
      recipeHash,
      rendererVersion,
      processedImageHash,
      buffer: rasterResult.buffer,
      mimeType: rasterResult.mimeType || 'image/png'
    };
  }
}

module.exports = { ImageRecipeService };
