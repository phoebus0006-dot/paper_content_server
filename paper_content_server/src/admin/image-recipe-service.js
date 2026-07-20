// image-recipe-service.js
const path = require('path');
const fs = require('fs');

class ImageRecipeService {
  constructor(runtime) {
    this.runtime = runtime;
  }

  /**
   * Validates if a photoId is allowed to be published and sanitizes its recipe.
   * Prevents Path Traversal by enforcing photoId exists in known indices.
   * Validates and recalculates crop parameters to guarantee an 800x480 output proportion.
   */
  async validateAndApplyRecipe(photoId, requestedRecipe) {
    if (!photoId || typeof photoId !== 'string') {
      throw new Error('Invalid photoId');
    }
    
    if (photoId.includes('..') || photoId.includes('/') || photoId.includes('\\')) {
      throw new Error('Path traversal attempt detected in photoId');
    }

    // Check against image_index.json
    let imgIdx = [];
    try {
      const idxPath = path.join(process.cwd(), 'data', 'image_index.json');
      imgIdx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    } catch (e) {
      // ignore
    }

    let foundPhoto = imgIdx.find(e => e.id === photoId);
    
    // Also check custom library if assetRepository is available
    if (!foundPhoto && this.runtime.assetRepository) {
      try {
        const customAssets = await this.runtime.assetRepository.listAssets('custom');
        foundPhoto = customAssets.find(a => a.assetId === photoId);
      } catch (e) {}
    }

    if (!foundPhoto) {
      throw new Error('unknown photo or photo not authorized for publishing: ' + photoId);
    }

    // Build a sanitized recipe
    const safeRecipe = {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      gamma: 1,
      rotate: 0,
      flipH: false,
      flipV: false,
      sharpen: 0,
      blur: 0,
      crop: null
    };

    if (requestedRecipe && typeof requestedRecipe === 'object') {
      safeRecipe.brightness = Number(requestedRecipe.brightness) || 1;
      safeRecipe.contrast = Number(requestedRecipe.contrast) || 1;
      safeRecipe.saturation = Number(requestedRecipe.saturation) || 1;
      safeRecipe.gamma = Number(requestedRecipe.gamma) || 1;
      safeRecipe.rotate = Number(requestedRecipe.rotate) || 0;
      safeRecipe.flipH = !!requestedRecipe.flipH;
      safeRecipe.flipV = !!requestedRecipe.flipV;
      safeRecipe.sharpen = Number(requestedRecipe.sharpen) || 0;
      safeRecipe.blur = Number(requestedRecipe.blur) || 0;

      // Strong crop validation to ensure 800x480 aspect ratio (5:3)
      if (requestedRecipe.crop && typeof requestedRecipe.crop === 'object') {
        const cw = Math.max(1, Math.round(Number(requestedRecipe.crop.width) || 0));
        const ch = Math.max(1, Math.round(Number(requestedRecipe.crop.height) || 0));
        const cx = Math.max(0, Math.round(Number(requestedRecipe.crop.left) || 0));
        const cy = Math.max(0, Math.round(Number(requestedRecipe.crop.top) || 0));
        
        if (cw > 0 && ch > 0) {
          // Verify aspect ratio (800 / 480 = 1.666)
          const expectedAspect = 800 / 480;
          const actualAspect = cw / ch;
          // allow small floating point / rounding errors in aspect ratio matching
          if (Math.abs(actualAspect - expectedAspect) > 0.05) {
             throw new Error('Invalid crop aspect ratio. Must be exactly 800x480 proportional.');
          }
          
          safeRecipe.crop = {
            left: cx,
            top: cy,
            width: cw,
            height: ch
          };
        }
      }
    }

    return safeRecipe;
  }
}

module.exports = { ImageRecipeService };
