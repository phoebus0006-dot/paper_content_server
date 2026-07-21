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

  sourceHash(inputPath) {
    const fd = fs.openSync(inputPath, 'r');
    const hash = crypto.createHash('sha256');
    const buf = Buffer.alloc(65536);
    var bytes = 0;
    while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytes));
    }
    fs.closeSync(fd);
    return hash.digest('hex');
  }

  hashRecipe(recipe, sourceHash) {
    var str = sourceHash ? sourceHash + ':' : '';
    str += JSON.stringify(this._sortObjectKeys(recipe));
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  async processImage(inputPath, recipe) {
    if (!inputPath) throw new Error('Input path is required');
    if (!recipe || typeof recipe !== 'object') throw new Error('Recipe is required');
    if (!fs.existsSync(inputPath)) throw new Error('File not found: ' + inputPath);

    var srcHash = this.sourceHash(inputPath);
    var canonicalRecipe = this.normalizeRecipe(recipe);

    var img = sharp(inputPath);

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
      var currentMeta = await img.toBuffer().then(function(b) { return sharp(b).metadata(); });

      var cx = Math.floor(canonicalRecipe.crop.x * currentMeta.width);
      var cy = Math.floor(canonicalRecipe.crop.y * currentMeta.height);
      var cw = Math.max(1, Math.floor(canonicalRecipe.crop.width * currentMeta.width));
      var ch = Math.max(1, Math.floor(canonicalRecipe.crop.height * currentMeta.height));
      var cropW = Math.min(cw, currentMeta.width - cx);
      var cropH = Math.min(ch, currentMeta.height - cy);

      img = img.extract({
        left: cx, top: cy, width: cropW, height: cropH
      });

      if (canonicalRecipe.zoom > 1) {
        var zw = Math.max(1, Math.floor(cropW / canonicalRecipe.zoom));
        var zh = Math.max(1, Math.floor(cropH / canonicalRecipe.zoom));

        var pxOffset = canonicalRecipe.panX * (cropW - zw) / 2;
        var pyOffset = canonicalRecipe.panY * (cropH - zh) / 2;

        var zx = Math.max(0, Math.floor((cropW - zw) / 2 + pxOffset));
        var zy = Math.max(0, Math.floor((cropH - zh) / 2 + pyOffset));

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

    // Output raw RGB (3 channels) for canonical epaper image-frame encoder
    var result = await img.raw().toBuffer({ resolveWithObject: true });
    var recipeHash = this.hashRecipe(canonicalRecipe, srcHash);
    var processedHash = crypto.createHash('sha256').update(result.data).digest('hex');

    return {
      buffer: result.data,
      info: result.info,
      sourceHash: srcHash,
      recipeHash: recipeHash,
      hash: processedHash
    };
  }

  async processAsset(assetId, recipe, options) {
    if (!this.assetRepository) throw new Error('Asset repository not configured');
    if (!this.imageRasterizer) throw new Error('Image rasterizer not configured');
    options = options || {};

    var asset = await this.assetRepository.getAsset(assetId);
    if (!asset) throw new Error('Asset not found: ' + assetId);

    if (asset.safetyStatus !== 'SAFE' && !options.skipSafetyCheck) {
      throw new Error('Asset not safe: ' + asset.safetyStatus);
    }
    if (asset.reviewStatus !== 'APPROVED' && !options.skipReviewCheck) {
      throw new Error('Asset not approved: ' + asset.reviewStatus);
    }

    var canonicalRecipe = this.normalizeRecipe(recipe);
    var srcHash = asset.sha256 || this.sourceHash(asset.rawPath || asset.path);
    var rendererVersion = this.imageRasterizer.getVersion ? this.imageRasterizer.getVersion() : 'v1';

    var rasterResult = await this.imageRasterizer.rasterize(
      asset.rawPath || asset.path,
      canonicalRecipe,
      { width: 800, height: 480 }
    );

    var recipeHash = crypto.createHash('sha256')
      .update(srcHash + ':' + JSON.stringify(this._sortObjectKeys(canonicalRecipe)) + ':' + rendererVersion)
      .digest('hex');

    var processedHash = crypto.createHash('sha256').update(rasterResult.frameBuffer).digest('hex');

    return {
      assetId: assetId,
      sourceHash: srcHash,
      canonicalRecipe: canonicalRecipe,
      recipeHash: recipeHash,
      rendererVersion: rendererVersion,
      processedImageHash: processedHash,
      buffer: rasterResult.frameBuffer,
      mimeType: 'application/epf1'
    };
  }
}

module.exports = { ImageRecipeService };
