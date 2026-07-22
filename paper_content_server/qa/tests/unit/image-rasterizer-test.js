const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('ImageRasterizer', () => {
  let rasterizer;

  before(() => {
    const { ImageRasterizer } = require('../../../src/images/image-rasterizer-v2');
    rasterizer = new ImageRasterizer();
  });

  it('should return version string', () => {
    assert.match(rasterizer.getVersion(), /^v\d/);
  });

  it('should reject non-existent file', async () => {
    await assert.rejects(
      () => rasterizer.rasterize('/nonexistent/path.png', { fitMode: 'contain' }, { width: 800, height: 480 }),
      /File not found/
    );
  });

  it('should normalize recipe with fitMode contain', () => {
    const { ImageRecipeService } = require('../../../src/images/image-recipe-service');
    const svc = new ImageRecipeService();
    const recipe = svc.normalizeRecipe({ fitMode: 'contain' });
    assert.equal(recipe.fitMode, 'contain');
    assert.equal(recipe.background, '#ffffff');
  });

  it('should normalize recipe preserving zero values', () => {
    const { ImageRecipeService } = require('../../../src/images/image-recipe-service');
    const svc = new ImageRecipeService();
    const recipe = svc.normalizeRecipe({ crop: { x: 0, y: 0, width: 1, height: 1 } });
    assert.equal(recipe.crop.x, 0);
    assert.equal(recipe.crop.width, 1);
  });

  it('should hash recipe consistently', () => {
    const { ImageRecipeService } = require('../../../src/images/image-recipe-service');
    const svc = new ImageRecipeService();
    const h1 = svc.hashRecipe({ fitMode: 'contain', crop: { x: 0, y: 0, width: 1, height: 1 } });
    const h2 = svc.hashRecipe({ fitMode: 'contain', crop: { x: 0, y: 0, width: 1, height: 1 } });
    assert.equal(h1, h2);
  });

  it('should generate different hashes for different recipes', () => {
    const { ImageRecipeService } = require('../../../src/images/image-recipe-service');
    const svc = new ImageRecipeService();
    const h1 = svc.hashRecipe({ fitMode: 'contain' });
    const h2 = svc.hashRecipe({ fitMode: 'cover' });
    assert.notEqual(h1, h2);
  });
});
